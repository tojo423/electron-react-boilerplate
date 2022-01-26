import WebSocket from 'ws';
import assert from 'assert/strict';
import debug from 'debug';
import { UserBot } from './UserBot';

const GatewayAddress = 'wss://gateway.discord.gg/?v=9&encoding=json';
const UserAgent =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.99 Safari/537.36';

export interface ClientState {
  private_channels: {
    type: number;
    id: string;
  }[];

  user: {
    verified: boolean;
    phone: any;
    mobile: boolean;
  };

  guilds: {
    roles: {
      position: number;
      permissions: number[];
      name: string;
      mentionable: boolean;
      managed: boolean;
      id: string;
    }[];

    name: string;
    max_members: number;
    icon: string;
    description: string;
    public_updates_channel_id: string;
    member_acount: number;

    channels: {
      user_limit: number;
      type: number;
      position: number;
      topic: string;

      permission_overwirtes: {
        type: number;
        id: string;
        deny: number;
        allow: number;
      }[];

      parent_id: string;
      name: string;
      id: string;
    }[];

    id: string;
    rules_channel_id: string;
    owner_id: string;
    features: string[];
    preferred_locale: string;
    large: boolean;
    verification_level: number;
  }[];
}

export class Socket {
  token: string;
  isConnecting: boolean = false;
  isConnected: boolean = false;
  isReady: boolean = false;
  clientState: ClientState;

  private ws: WebSocket;
  private sequence: number;
  private heartbeatTimer: NodeJS.Timer;

  private log: debug.Debugger;

  constructor(username: string, token: string) {
    this.token = token;
    this.log = debug(`WebSocket:${username}`);
  }

  public async connect(): Promise<boolean> {
    assert.ok(!this.isConnecting, 'Already connecting');
    assert.ok(!this.isConnected, 'Aready connected');
    assert.ok(this.token, 'No token');

    this.log('⚙ Connecting...');

    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(GatewayAddress, {
        headers: {
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          Host: 'gateway.discord.gg',
          Origin: 'https://discord.com',
          Pragma: 'no-cache',
          'Sec-WebSocket-Extensions':
            'permessage-deflate; client_max_window_bits',
          'Sec-WebSocket-Version': 13,
          Upgrade: 'websocket',
          'User-Agent': UserAgent,
        },
        origin: 'https://discord.com',
        protocolVersion: 13,
        perMessageDeflate: true,
      });
      this.ws = ws;

      ws.on('open', () => {
        this.log('✔ Opened');

        this.isConnecting = false;
        this.isConnected = true;

        this.log('⚙ Identifying...');
        this.identify();
      });

      ws.on('close', () => {
        this.log('✖ Closed');

        this.isConnected = false;

        const heartbeatTimer = this.heartbeatTimer;
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          this.heartbeatTimer = null;
        }

        if (this.isConnecting) {
          this.isConnecting = false;
          reject(false);
        }
      });

      ws.on('error', (error) => {
        this.log(`❌ Error: ${error}`);

        ws.close();
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.s) {
          this.sequence = Number.parseInt(message.s);
        }

        switch (Number.parseInt(message.op)) {
          case 0:
            console.log('Message Received - Parse Event - Type:', message.t);
            switch (message.t) {
              case 'READY':
                this.log('✔ Ready Message Received');

                this.clientState = message.d;
                this.isReady = true;

                if (this.isConnecting) {
                  this.isConnecting = false;
                  resolve(true);
                }
                break;
            }
            break;
          case 9:
            this.identify();
            break;
          case 10:
            const heartbeatInterval = message.d.heartbeat_interval;
            console.log('Interval:', heartbeatInterval);
            this.heartbeat(heartbeatInterval);
            break;
        }
      });
    });
  }

  public dispose(): void {
    this.log(`⚙ Disposing...`);

    this.ws?.close();
    this.isReady = false;
    this.isConnecting = false;
    this.isConnected = false;

    this.log(`✔ Disposed`);
  }

  private identify(): void {
    const data = {
      op: 2,
      d: {
        token: this.token,
        capabilities: 253,
        properties: {
          os: 'Windows',
          browser: 'Chrome',
          device: '',
          system_locale: 'en-US',
          browser_user_agent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.99 Safari/537.36',
          browser_version: '97.0.4692.99',
          os_version: '10',
          referrer: 'https://www.google.com/',
          referring_domain: 'www.google.com',
          search_engine: 'google',
          referrer_current: 'https://www.google.com/',
          referring_domain_current: 'www.google.com',
          search_engine_current: 'google',
          release_channel: 'stable',
          client_build_number: 111699,
          client_event_source: null,
        },
        presence: {
          status: 'online',
          since: 0,
          activities: [],
          afk: false,
        },
        compress: false,
        client_state: {
          guild_hashes: {},
          highest_last_message_id: '0',
          read_state_version: 0,
          user_guild_settings_version: -1,
          user_settings_version: -1,
        },
      },
    };
    const dataJson = JSON.stringify(data);
    this.ws.send(Buffer.from(dataJson));
  }

  private heartbeat(heartbeatInterval: number): void {
    this.heartbeatTimer = setInterval(() => {
      if (!this.isConnected) {
        return;
      }

      const data = {
        op: 1,
        d: this.sequence,
      };
      const dataJson = JSON.stringify(data);
      this.ws.send(Buffer.from(dataJson));
    }, heartbeatInterval - 1000);
  }
}
