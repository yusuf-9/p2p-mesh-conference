import AuthService from "../auth/index.js";
import DatabaseService from "../database/index.js";
import PubSubService from "../pubsub/index.js";
import SfuClient from "../sfu-client/index.js";
import ConfigService from "../config/index.js";
import {
  ClientToServerMessages,
  MediaStreamToggleData,
} from "../ws/schema.js";
import { ServerToClientMessages } from "../ws/types.js";
import { JanusEvent, VideoroomJoinedEvent, VideoroomPublishSuccessEvent, VideoroomSubscriberAttachedEvent, VideoroomConfiguredEvent, SfuHandleDetachedEvent, VideoroomPublisherJoinedEvent, VideoRoomWebRTCConnectionSuccessEvent } from "../sfu-client/types.js";
import { VideoroomJoinedEventSchema, VideoroomPublishSuccessEventSchema, VideoroomSubscriberAttachedEventSchema, VideoroomConfiguredEventSchema, VideoroomHandleDetachedEventSchema, VideoRoomPublisherJoinedEventSchema, VideoRoomWebRTCConnectionSuccessEventSchema } from "../sfu-client/schemas.js";
import SocketServer from "../ws/index.js";
import { EVENTS } from "../ws/constants.js";
import { StandardizedPublisher } from "../database/types.js";
import { retryPromiseIfFails } from "../../utils/index.js";
import { on } from "events";

export default class SfuManager {
  private authService: AuthService;
  private dbService: DatabaseService;
  private pubSubService: PubSubService;
  private configService: ConfigService;
  private sfuClients: Map<string, { client: SfuClient; ready: boolean }> = new Map();
  private emitSfuEvent: SocketServer["emitSfuEvent"];
  private emitToRoom: SocketServer["emitToRoom"];

  constructor(
    authService: AuthService,
    dbService: DatabaseService,
    pubSubService: PubSubService,
    configService: ConfigService,
    emitSfuEvent: SocketServer["emitSfuEvent"],
    emitToRoom: SocketServer["emitToRoom"]
  ) {
    this.authService = authService;
    this.dbService = dbService;
    this.pubSubService = pubSubService;
    this.configService = configService;
    this.sfuClients = new Map();
    this.emitSfuEvent = emitSfuEvent;
    this.emitToRoom = emitToRoom;

    this.initializeSfuClients();
  }

  /**
   * Transforms raw SFU publisher data into standardized publisher objects
   * Returns: { id, feedType, userId, audio, video, talking, publisher }
   */
  private async standardizePublisher(rawPublisher: any): Promise<StandardizedPublisher | null> {
    try {
      if (!rawPublisher?.id) {
        console.warn("Publisher missing id, skipping");
        return null;
      }

      const handle = await this.dbService.mediaRoomRepository.getPubHandleByFeedId(rawPublisher.id);
      if (!handle || !handle.userId) {
        console.warn(`No media handle found for publisher in standardize publisher ${rawPublisher.id}`);
        return null;
      }

      return {
        id: rawPublisher.id,
        feedType: handle.feedType || "camera",
        userId: handle.userId,
        audio: handle.audioEnabled,
        video: handle.videoEnabled,
        talking: rawPublisher.talking || false,
        publisher: rawPublisher.publisher !== false, // Default to true unless explicitly false
        handRaised: handle.handRaised || false,
        simulcastEnabled: handle.simulcastEnabled || false,
        simulcastResolutions: handle.simulcastResolutions ? JSON.parse(handle.simulcastResolutions) : [],
      };
    } catch (error) {
      console.error(`Error standardizing publisher ${rawPublisher?.id}:`, error);
      return null;
    }
  }

  /**
   * Transforms an array of raw SFU publishers into standardized publisher objects
   */
  private async standardizePublishers(rawPublishers: any[]): Promise<StandardizedPublisher[]> {
    const standardizedPublishers = await Promise.all(
      rawPublishers.map(publisher => this.standardizePublisher(publisher))
    );

    // Filter out null results
    return standardizedPublishers.filter(publisher => publisher !== null) as StandardizedPublisher[];
  }

  private async initializeSfuClients() {
    try {
      const sfuInstances = await this.getSfuInstances();
      await Promise.all(
        sfuInstances.map(sfuInstance =>
          this.validateSfuConnection(
            new SfuClient(this.authService, this.dbService, sfuInstance, this.handleSfuEvent.bind(this), this.emitSfuResponse.bind(this)),
            sfuInstance.name
          )
        )
      );
    } catch (error) {
      console.error("Error initializing SFU clients:", error);
    }
  }

  private async getSfuInstances() {
    return [
      {
        name: "main",
        uri: this.configService.sfu.uri
      },
    ];
  }

  private async validateSfuConnection(sfuClient: SfuClient, sfuName: string) {
    try {
      await sfuClient.connect();
      this.sfuClients.set(sfuName, {
        client: sfuClient,
        ready: true,
      });
    } catch (error) {
      console.error("Error connecting to SFU:", error);
      this.sfuClients.set(sfuName, {
        client: sfuClient,
        ready: false,
      });
    }
  }

  private async runOnlyIfSfuClientIsReady(func: () => Promise<any>) {
    if (!this.sfuClients.get("main")?.ready) {
      throw new Error("SFU client is not ready");
    }
    return await func();
  }

  private async linkEventToTransaction(transactionId: string, callback: (userId: string, feedId?: number) => Promise<any>) {
    const transaction = await this.dbService.mediaRoomRepository.getPendingTransactionByTransactionId(transactionId);

    if (!transaction) {
      console.log("unknown transaction", transactionId);
      return;
    }
    
    if(transaction.type === "configure_feed_subscription") {
      console.log("configuring feed subscription")
      return;
    }

    await callback(transaction.userId, transaction.feedId || undefined);

    await this.dbService.mediaRoomRepository.deletePendingTransaction(transaction.id);
  }

  private async handleSfuEvent(eventPayload: JanusEvent | VideoRoomWebRTCConnectionSuccessEvent) {
    try {
      switch (true) {
        case VideoroomJoinedEventSchema.safeParse(eventPayload).success:
          const joinedEvent = eventPayload as VideoroomJoinedEvent;
          await this.linkEventToTransaction(joinedEvent.transaction, async (userId: string, feedId?: number) => {

            // Get the media handle for this user's feed to create the feed object
            const mediaHandle = await retryPromiseIfFails(async () => {
              const handle = await this.dbService.mediaRoomRepository.getPubHandleByFeedId(joinedEvent.plugindata.data.id);
              if (!handle || !handle.userId) {
                throw new Error(`No media handle found for publisher with feedId ${joinedEvent.plugindata.data.id}`);
              }
              return handle;
            }, 3);

            if (!mediaHandle) {
              console.log(`No media handle found for publisher with feedId ${joinedEvent.plugindata.data.id}`);
              return;
            }

            // Create the feed object for this user's newly joined feed
            const userFeed: StandardizedPublisher = {
              id: joinedEvent.plugindata.data.id,
              feedType: mediaHandle.feedType || "camera",
              userId: mediaHandle.userId!,
              audio: mediaHandle.audioEnabled,
              video: mediaHandle.videoEnabled,
              talking: false,
              publisher: false,
              handRaised: mediaHandle.handRaised || false,
              simulcastEnabled: mediaHandle.simulcastEnabled,
              simulcastResolutions: mediaHandle.simulcastResolutions ? JSON.parse(mediaHandle.simulcastResolutions) : []
            };

            // Standardize publishers data
            const standardizedPublishers = await this.standardizePublishers(
              joinedEvent.plugindata?.data?.publishers || []
            );

            await this.emitSfuEvent(userId, EVENTS.JOINED_CONFERENCE_AS_PUBLISHER, {
              room: joinedEvent.plugindata.data.room,
              feed: userFeed,
              publishers: standardizedPublishers,
            });

            console.log(`User ${userId} joined call as publisher with feedId ${joinedEvent.plugindata.data.id}, feedType: ${userFeed.feedType}`);
          });
          break;

        case VideoroomPublishSuccessEventSchema.safeParse(eventPayload).success:
          console.log("publish success event", eventPayload);
          const publishSuccessEvent = eventPayload as VideoroomPublishSuccessEvent;
          await this.linkEventToTransaction(publishSuccessEvent.transaction, async (userId: string, feedId?: number) => {
            await this.emitSfuEvent(userId, EVENTS.RECEIVE_ANSWER_FOR_PUBLISHING, {
              configured: publishSuccessEvent.plugindata.data.configured,
              audio_codec: publishSuccessEvent.plugindata.data.audio_codec ?? '',
              video_codec: publishSuccessEvent.plugindata.data.video_codec ?? '',
              streams: publishSuccessEvent.plugindata.data.streams,
              jsep: publishSuccessEvent.jsep,
            });
          });
          break;

        case VideoroomSubscriberAttachedEventSchema.safeParse(eventPayload).success:
          console.log("subscriber attached event", eventPayload);
          const subscriberAttachedEvent = eventPayload as VideoroomSubscriberAttachedEvent;
          await this.linkEventToTransaction(subscriberAttachedEvent.transaction, async (userId: string, feedId?: number) => {
            await this.emitSfuEvent(userId, EVENTS.SUBSCRIBED_TO_USER_FEED, {
              room: subscriberAttachedEvent.plugindata.data.room,
              streams: subscriberAttachedEvent.plugindata.data.streams,
              jsep: subscriberAttachedEvent.jsep,
              feedId: feedId!
            });
          });
          break;

        case VideoroomConfiguredEventSchema.safeParse(eventPayload).success:
          console.log("media stream configured event", eventPayload);
          const configuredEvent = eventPayload as VideoroomConfiguredEvent;
          await this.linkEventToTransaction(configuredEvent.transaction, async (userId: string, feedId?: number) => {
            // Get the user's current media settings from database
            const user = await this.dbService.userRepository.getUserById(userId);
            if (!user) {
              console.warn("User not found for configured event:", userId);
              return;
            }

            if (!feedId) {
              console.warn("No feedId found in stream toggle transaction for user", userId);
              return;
            }

            // Get the media handle to retrieve audio/video state
            const mediaHandle = await this.dbService.mediaRoomRepository.getPubHandleByFeedId(feedId);
            if (!mediaHandle) {
              console.warn("Media handle not found for feedId:", feedId);
              return;
            }

            // Broadcast the media stream toggle to the room using the clean emitToRoom method
            await this.emitSfuEvent(user.id, EVENTS.MEDIA_STREAM_TOGGLED, {
              video: mediaHandle.videoEnabled,
              audio: mediaHandle.audioEnabled,
              feedId: feedId,
            });

            // Broadcast the media stream toggle to users in call
            await this.emitToRoom(user.roomId, EVENTS.PUBLISHER_TOGGLED_MEDIA_STREAM, {
              video: mediaHandle.videoEnabled,
              audio: mediaHandle.audioEnabled,
              feedId: feedId,
              userId: user.id
            }, user.id, true);

            console.log("Media stream toggle broadcasted for user", userId, "feedId", feedId);
          });
          break;

        case VideoRoomPublisherJoinedEventSchema.safeParse(eventPayload).success:
          // console.log("media stream configured event", eventPayload);
          // const publisherJoinedEvent = eventPayload as VideoroomPublisherJoinedEvent;
          // // Get the user's current media settings from database
          // const roomAssociatedWithSession = await this.dbService.mediaRoomRepository.getMediaSessionBySessionId(publisherJoinedEvent.session_id.toString());
          //
          // if (!roomAssociatedWithSession) {
          //   console.warn("Room not found for publisher joined event:", publisherJoinedEvent.session_id);
          //   return;
          // }
          //
          // const userToEmitTo = await this.dbService.mediaRoomRepository.getMediaHandleByHandleId(publisherJoinedEvent.sender.toString());
          //
          // if (!userToEmitTo) {
          //   console.warn("User not found for publisher joined event:", publisherJoinedEvent.sender);
          //   return;
          // }
          // const sfuPublisherFeed = publisherJoinedEvent.plugindata.data.publishers?.[0]?.id;
          // if (!sfuPublisherFeed) {
          //   console.warn("Feed ID not found for publisher joined event:", publisherJoinedEvent.sender);
          //   return;
          // }
          //
          // const userThatJoined = await this.dbService.mediaRoomRepository.getPubHandleByFeedId(sfuPublisherFeed);
          //
          // // Standardize publishers data
          // const standardizedPublishers = await this.standardizePublishers(
          //   publisherJoinedEvent.plugindata?.data?.publishers || []
          // );
          //
          // console.log("publisher joined", standardizedPublishers)
          //
          // // Broadcast the publisher joined event to the room
          // await this.emitSfuEvent(userToEmitTo.userId!, EVENTS.PUBLISHER_JOINED_CONFERENCE, {
          //   userId: userThatJoined.userId!,
          //   publishers: standardizedPublishers,
          // });
          //
          // console.log("Publisher joined conference broadcasted for user", userToEmitTo.userId);
          break;

        case VideoRoomWebRTCConnectionSuccessEventSchema.safeParse(eventPayload).success:
          console.log("webrtc connection success event", eventPayload);
          const webrtcConnectionSuccessEvent = eventPayload as VideoRoomWebRTCConnectionSuccessEvent;

          const handleThatConnected = await this.dbService.mediaRoomRepository.getMediaHandleByHandleId(webrtcConnectionSuccessEvent.sender.toString());
          if (!handleThatConnected) {
            console.warn("VideoRoomWebRTCConnectionSuccessEventSchema Handle not found for webrtc connection success event:", webrtcConnectionSuccessEvent.sender);
            return;
          }

          const user = await this.dbService.userRepository.getUserById(handleThatConnected.userId!);
          if (!user) {
            console.warn("VideoRoomWebRTCConnectionSuccessEventSchema User not found for webrtc connection success event:", handleThatConnected.userId);
            return;
          }

          await this.emitSfuEvent(
            handleThatConnected.userId!,
            handleThatConnected.type === "publisher" ? EVENTS.PUBLISHER_WEBRTC_CONNECTION_ESTABLISHED : EVENTS.SUBSCRIBER_WEBRTC_CONNECTION_ESTABLISHED,
            {
              feedId: handleThatConnected.feedId!,
            }
          );

          if (handleThatConnected.type === "publisher") {
            console.log("emitting publisher joined conference");
            this.emitToRoom(user.roomId!, EVENTS.PUBLISHER_JOINED_CONFERENCE, {
              publisher: {
                id: handleThatConnected.feedId!,
                userId: handleThatConnected.userId!,
                feedType: handleThatConnected.feedType!,
                audio: handleThatConnected.audioEnabled!,
                video: handleThatConnected.videoEnabled!,
                talking: false,
                publisher: true,
                handRaised: handleThatConnected.handRaised!,
                simulcastEnabled: handleThatConnected.simulcastEnabled!,
                simulcastResolutions: handleThatConnected.simulcastResolutions ? JSON.parse(handleThatConnected.simulcastResolutions) : []
              }
            }, handleThatConnected.userId!, true);
          }

          if (!user.joinedCall) {
            // Update database first to prevent race conditions
            await this.dbService.userRepository.updateUser(handleThatConnected.userId!, {
              joinedCall: true
            });

            // Always emit USER_JOINED_CALL for the first WebRTC connection (regardless of type)
            // This ensures the event is sent even if subscriber connects before publisher
            this.emitToRoom(user.roomId!, EVENTS.USER_JOINED_CALL, {
              userId: handleThatConnected.userId!,
            }, handleThatConnected.userId!, false);

            console.log(`📢 User ${handleThatConnected.userId} joined call - event broadcasted`);
          }
          break;
      }
    } catch (error) {
      console.error("Error handling SFU event:", error);
    }
  }


  private async emitSfuResponse<T extends keyof ServerToClientMessages>(
    userToEmitToId: string,
    event: T,
    data: ServerToClientMessages[T] extends { data: infer D } ? D : never
  ) {
    await this.emitSfuEvent(userToEmitToId, event, data);
  }

  public async handleJoinConference(userId: string, roomId: string, feedType: "camera" | "screenshare" = "camera", audioEnabled: boolean = true, videoEnabled: boolean = true, simulcastEnabled: boolean = false, simulcastResolutions: ("h" | "m" | "l")[] | null = null): Promise<void> {
    return await this.runOnlyIfSfuClientIsReady(async () => {
      await this.sfuClients.get("main")?.client.joinRoomAsPublisher(userId, roomId, feedType, audioEnabled, videoEnabled, simulcastEnabled, simulcastResolutions);
    });
  }

  public async handleSubscribeToUserFeed(userId: string, roomId: string, feedId: number, preferredResolution: "h" | "m" | "l" | null = null): Promise<void> {
    await this.runOnlyIfSfuClientIsReady(async () => {
      await this.sfuClients.get("main")?.client.subscribeToUserFeed(userId, roomId, feedId, preferredResolution);
    });
  }

  public async handleSendOfferForPublishing(
    userId: string,
    roomId: string,
    data: ClientToServerMessages[typeof EVENTS.SEND_OFFER_FOR_PUBLISHING]["data"]
  ): Promise<void> {
    await this.runOnlyIfSfuClientIsReady(async () => {
      await this.sfuClients.get("main")?.client.sendOfferForPublishing(userId, roomId, data);
    });
  }

  public async handleSendAnswerForSubscribing(
    userId: string,
    roomId: string,
    data: ClientToServerMessages[typeof EVENTS.SEND_ANSWER_FOR_SUBSCRIBING]["data"]
  ): Promise<void> {
    await this.runOnlyIfSfuClientIsReady(async () => {
      await this.sfuClients.get("main")?.client.sendAnswerForSubscribing(userId, roomId, data);
    });
  }

  public async handleSendIceCandidates(
    userId: string,
    roomId: string,
    data: ClientToServerMessages[typeof EVENTS.SEND_ICE_CANDIDATES]["data"]
  ): Promise<void> {
    await this.runOnlyIfSfuClientIsReady(async () => {
      await this.sfuClients.get("main")?.client.setIceCandidates(userId, roomId, data);
    });
  }

  public async handleSendIceCandidateCompleted(
    userId: string,
    roomId: string,
    data: ClientToServerMessages[typeof EVENTS.SEND_ICE_CANDIDATE_COMPLETED]["data"]
  ): Promise<void> {
    await this.runOnlyIfSfuClientIsReady(async () => {
      await this.sfuClients.get("main")?.client.setIceCandidateCompleted(userId, roomId, data);
    });
  }

  public async handleToggleMediaStream(userId: string, roomId: string, data: MediaStreamToggleData): Promise<void> {
    await this.runOnlyIfSfuClientIsReady(async () => {
      // Update the media handle's audio/video state in the database
      const mediaHandle = await this.dbService.mediaRoomRepository.getPubHandleByFeedId(data.feedId);
      if (mediaHandle) {
        await this.dbService.mediaRoomRepository.updateMediaHandle(mediaHandle.id, {
          audioEnabled: data.audio,
          videoEnabled: data.video,
        });
      }

      await this.sfuClients.get("main")?.client.togglePublisherMedia(userId, roomId, data);
    });
  }

  public async handleUnpublishFeed(userId: string, roomId: string, data: ClientToServerMessages[typeof EVENTS.UNPUBLISH_FEED]["data"]): Promise<void> {
    try {
      await this.runOnlyIfSfuClientIsReady(async () => {
        await this.sfuClients.get("main")?.client.unpublishFeed(userId, roomId, data);

        // Send confirmation to user
        await this.emitSfuEvent(userId, EVENTS.FEED_UNPUBLISHED, {
          feedId: data.feedId,
        });

        // Broadcast to other users in the call that this feed was unpublished
        await this.emitToRoom(roomId, EVENTS.PUBLISHER_UNPUBLISHED_FEED, {
          userId: userId,
          feedId: data.feedId,
        }, userId, true);

        console.log(`Feed ${data.feedId} unpublished for user ${userId} - broadcasted to room`);
      });
    } catch (error) {
      console.error(`Error unpublishing feed ${data.feedId} for user ${userId}:`, error);
    }
  }

  public async handleModerateFeed(hostId: string, roomId: string, feedId: number): Promise<{ success: boolean; feedUserId?: string; error?: string }> {
    try {
      // Get the media handle to find the user whose feed is being moderated
      const mediaHandle = await this.dbService.mediaRoomRepository.getPubHandleByFeedId(feedId);
      if (!mediaHandle) {
        return { success: false, error: "Feed not found" };
      }

      const feedUserId = mediaHandle.userId;
      if (!feedUserId) {
        return { success: false, error: "Feed user not found" };
      }

      await this.runOnlyIfSfuClientIsReady(async () => {
        // Unpublish the feed from SFU and delete handle
        await this.sfuClients.get("main")?.client.unpublishFeed(feedUserId, roomId, { feedId });

        console.log(`Feed ${feedId} moderated by host ${hostId} - unpublished from SFU`);
      });

      return { success: true, feedUserId };
    } catch (error) {
      console.error(`Error moderating feed ${feedId} by host ${hostId}:`, error);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  public async handleGetPublisherList(userId: string, roomId: string): Promise<void> {
    await this.runOnlyIfSfuClientIsReady(async () => {
      await this.sfuClients.get("main")?.client.requestPublisherList(userId, roomId);
    });
  }

  public async handleConfigureFeedSubscription(userId: string, roomId: string, data: ClientToServerMessages[typeof EVENTS.CONFIGURE_FEED_SUBSCRIPTION]["data"]): Promise<void> {
    await this.runOnlyIfSfuClientIsReady(async () => {
      await this.sfuClients.get("main")?.client.configureFeedSubscription(userId, roomId, data);
    });
  }

  public async cleanupUserHandles(userId: string, roomId: string): Promise<void> {
    try {
      await this.runOnlyIfSfuClientIsReady(async () => {
        await this.sfuClients.get("main")?.client.cleanupUserHandles(userId, roomId);

        const user = await this.dbService.userRepository.updateUser(userId, {
          joinedCall: false
        });

        const roomMediaSession = await this.dbService.mediaRoomRepository.getMediaSessionByRoomId(roomId);

        if (!roomMediaSession) {
          console.warn(`No media session found for room ${roomId}`);
        }

        // Delete all handles from database in one batch operation
        await this.dbService.mediaRoomRepository.deleteMediaHandlesOfUserInSession(roomMediaSession.id, userId);
        console.log(`🗑️ Deleted handles from database`);

        // Broadcast that the user has left the video room to the users in the room
        await this.emitToRoom(roomId, EVENTS.USER_LEFT_CALL, {
          userId: user.id,
        }, user.id);

        // Broadcast that the user has left the video room to the users in the call
        await this.emitToRoom(roomId, EVENTS.USER_LEFT_CONFERENCE, {
          userId: user.id,
        }, user.id, true);

        await this.emitSfuEvent(user.id, EVENTS.LEFT_CONFERENCE);
      });
    } catch (error) {
      console.error(`Error cleaning up handles for user ${userId}:`, error);
    }
  }

}
