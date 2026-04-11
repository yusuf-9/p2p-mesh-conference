/**
 * In-Memory PubSub Service
 * Replaces Redis with local in-memory broadcasting
 */
export default class PubSubService {
  private subscriptions: Map<string, Array<(message: string) => void>> = new Map();

  constructor() {
    // No external dependencies needed for in-memory solution
  }

  /**
   * Initializes the in-memory pub/sub service (no-op for compatibility)
   */
  public async connect(): Promise<void> {
    console.log('✅ In-Memory PubSub Service initialized');
  }

  /**
   * Cleanup (no-op for in-memory solution)
   */
  public async disconnect(): Promise<void> {
    this.subscriptions.clear();
    console.log('🚪 In-Memory PubSub Service disconnected');
  }

  /**
   * Publishes a message to a channel (broadcasts to all subscribers)
   */
  public async publish(channel: string, message: string): Promise<void> {
    try {
      const handlers = this.subscriptions.get(channel);
      if (handlers && handlers.length > 0) {
        handlers.forEach(handler => {
          try {
            handler(message);
          } catch (err) {
            console.error(`❌ Error in subscription handler for channel ${channel}:`, err);
          }
        });
      }
    } catch (err) {
      console.error(`❌ Error publishing to channel ${channel}:`, err);
      throw err;
    }
  }

  /**
   * Publishes a JSON message to a channel
   */
  public async publishJSON(channel: string, data: any): Promise<void> {
    try {
      const message = JSON.stringify(data);
      await this.publish(channel, message);
    } catch (err) {
      console.error(`❌ Error publishing JSON to channel ${channel}:`, err);
      throw err;
    }
  }

  /**
   * Subscribes to a channel with a message handler
   */
  public async subscribe(channel: string, handler: (message: string) => void): Promise<void> {
    try {
      if (!this.subscriptions.has(channel)) {
        this.subscriptions.set(channel, []);
      }

      const handlers = this.subscriptions.get(channel)!;
      handlers.push(handler);
    } catch (err) {
      console.error(`❌ Error subscribing to channel ${channel}:`, err);
      throw err;
    }
  }

  /**
   * Subscribes to a channel with a JSON message handler
   */
  public async subscribeJSON(channel: string, handler: (data: any) => void): Promise<void> {
    const messageHandler = (message: string) => {
      try {
        const data = JSON.parse(message);
        handler(data);
      } catch (err) {
        console.error(`❌ Error parsing JSON message from channel ${channel}:`, err);
      }
    };

    await this.subscribe(channel, messageHandler);
  }

  /**
   * Unsubscribes from a channel
   */
  public async unsubscribe(channel: string, handler?: (message: string) => void): Promise<void> {
    try {
      const handlers = this.subscriptions.get(channel);
      if (handlers) {
        if (handler) {
          const index = handlers.indexOf(handler);
          if (index > -1) {
            handlers.splice(index, 1);
          }
        } else {
          handlers.length = 0;
        }

        if (handlers.length === 0) {
          this.subscriptions.delete(channel);
        }
      }
    } catch (err) {
      console.error(`❌ Error unsubscribing from channel ${channel}:`, err);
      throw err;
    }
  }

  /**
   * Gets all active subscriptions
   */
  public getActiveSubscriptions(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  /**
   * Checks if service is "connected" (always true for in-memory)
   */
  public isConnected(): boolean {
    return true;
  }
}
