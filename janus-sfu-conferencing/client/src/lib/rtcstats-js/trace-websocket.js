import {compressMethod} from '../rtcstats-shared/index';

const PROTOCOL_VERSION = '5.0';
const RELOAD_COUNT_KEY = 'rtcstatsReloadCount';

export function WebSocketTrace(config = {}) {
    let buffer = [];
    let connection;
    let lastTime = 0;
    let connectionStartTime = 0;

    let reloadCount = undefined;
    if (window.sessionStorage && config.countReloads) {
        const stored = parseInt(window.sessionStorage.getItem(RELOAD_COUNT_KEY), 10);
        reloadCount = Number.isNaN(stored) ? 0 : stored + 1;
        window.sessionStorage.setItem(RELOAD_COUNT_KEY, reloadCount);
    }

    const trace = function(...args) {
        const now = Date.now();
        args.push(now - lastTime);
        lastTime = now;

        if (args[1] instanceof RTCPeerConnection) {
            args[1] = args[1].__rtcStatsId;
        }
        const method = args[0];
        args[0] = compressMethod(method);
        if (connection) {
            if (connection.readyState === WebSocket.OPEN) {
                if (buffer.length === 0) {
                    connection.send(JSON.stringify({ type: 'rtc-stats', data: args }));
                } else {
                    buffer.push(args);
                }
            } else if (connection.readyState === WebSocket.CONNECTING) {
                buffer.push(args);
            } else if ([WebSocket.CLOSING, WebSocket.CLOSED].includes(connection.readyState)) {
                // no-op. Possibly log?
            }
        } else {
            buffer.push(args);
        }
    };

    trace.close = () => {
        if (window.sessionStorage && config.countReloads) {
            window.sessionStorage.removeItem(RELOAD_COUNT_KEY);
        }
        if (connection) {
            connection.close();
            connection = null;
        }
        lastTime = 0;
    };

    // Shared setup for attaching event listeners and flushing the buffer.
    // Used by both the URL and external socket paths.
    const attachListeners = (ws) => {
        const connectionTime = Date.now() - connectionStartTime;

        ws.addEventListener('error', (e) => {
            if (config.log) {
                config.log('rtcstats websocket connection error', e, ws.readyState);
            }
        });

        ws.addEventListener('close', (e) => {
            if (e.code === 1008 && config.log) {
                config.log('rtcstats websocket connection closed with error=1008. ' +
                           'Typically this means authorization is required and failed.');
            }
        });

        const flush = () => {
            if (!buffer.length) {
                trace('websocket', null, { connectionTime });
                return;
            }
            if (ws.readyState !== WebSocket.OPEN) {
                return;
            }
            ws.send(JSON.stringify({ type: 'rtc-stats', data: buffer.shift() }));
            setTimeout(flush, 0);
        };

        if (ws.readyState === WebSocket.OPEN) {
            // Socket is already open — flush immediately
            setTimeout(flush, 0);
        } else {
            ws.addEventListener('open', () => {
                setTimeout(flush, 0);
            });
        }

        ws.addEventListener('message', (msg) => {
            // no messages from the server defined yet.
        });
    };

    trace.connect = (wsURLOrSocket) => {
        if (connection) {
            connection.close();
            lastTime = 0;
        }
        trace('create', null, {
            hardwareConcurrency: navigator.hardwareConcurrency,
            userAgentData: navigator.userAgentData,
            deviceMemory: navigator.deviceMemory,
            screen: {
                width: window.screen.availWidth,
                height: window.screen.availHeight,
                devicePixelRatio: window.devicePixelRatio,
            },
            window: {
                width: window.innerWidth,
                height: window.innerHeight,
            },
            reloadCount,
        });
        connectionStartTime = Date.now();

        if (wsURLOrSocket instanceof WebSocket) {
            // Use the provided socket instance directly
            connection = wsURLOrSocket;
        } else {
            // Create a new connection from the URL string (original behaviour)
            connection = new WebSocket(wsURLOrSocket, 'rtcstats#' + PROTOCOL_VERSION);
        }

        attachListeners(connection);
    };

    return trace;
}
