"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Token_1 = require("./Token");
const http2 = require("http2");
const defaultPingInterval = 300000;
let AuthorityAddress = {
    production: "https://api.push.apple.com:443",
    development: "https://api.development.push.apple.com:443"
};
class APNPushProvider {
    constructor(options) {
        this.options = options;
        this.authToken = new Token_1.AuthToken(options.token);
        if (typeof options.production == 'undefined' || options.production === null) {
            options.production = process.env.NODE_ENV === "production";
        }
    }
    ensureConnected() {
        if (!this.session || this.session.destroyed) {
            this.session = http2.connect(this.options.production ? AuthorityAddress.production : AuthorityAddress.development);
            let pingInterval = typeof this.options.pingInterval === 'number' ? this.options.pingInterval : defaultPingInterval;
            if (pingInterval <= 0) {
                pingInterval = defaultPingInterval;
            }
            this.session.once('connect', () => {
                this.pingTimer = setInterval(() => {
                    this.session.ping(() => { });
                }, pingInterval);
            });
        }
    }
    getAuthToken() {
        // return the same token for 3000 seconds
        if (this._lastTokenTime > Date.now() - 3000 * 1000) {
            return this._lastToken;
        }
        this._lastTokenTime = Date.now();
        this._lastToken = this.authToken.generate();
        return this._lastToken;
    }
    send(notification, deviceTokens) {
        this.ensureConnected();
        if (!Array.isArray(deviceTokens)) {
            deviceTokens = [deviceTokens];
        }
        let authToken = this.getAuthToken();
        return Promise.all(deviceTokens.map(deviceToken => {
            var headers = {
                ':method': 'POST',
                ':path': '/3/device/' + deviceToken,
                'authorization': 'bearer ' + authToken,
            };
            headers = Object.assign(headers, notification.headers());
            return this.sendPostRequest(headers, notification.compile(), deviceToken);
        })).then(results => {
            let sent = results.filter(res => res.status === "200").map(res => res.device);
            let failed = results.filter(res => res.status !== "200").map(res => {
                if (res.error)
                    return { device: res.device, error: res.error };
                return {
                    device: res.device,
                    status: res.status,
                    response: JSON.parse(res.body)
                };
            });
            return { sent, failed };
        });
    }
    sendPostRequest(headers, payload, deviceToken) {
        return new Promise((resolve, reject) => {
            const req = this.session.request(headers);
            req.setEncoding('utf8');
            req.on('response', (headers) => {
                let status = headers[http2.constants.HTTP2_HEADER_STATUS].toString();
                // ...
                let data = '';
                req.on('data', (chunk) => {
                    data += chunk;
                });
                req.on('end', () => {
                    resolve({ status: status, body: data, device: deviceToken });
                });
            });
            req.on('error', (err) => {
                resolve({ error: err });
            });
            req.write(payload);
            req.end();
        });
    }
    shutdown() {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            delete this.pingTimer;
        }
        this.session.destroy();
    }
}
exports.APNPushProvider = APNPushProvider;
//# sourceMappingURL=APNPushProvider.js.map