import { gotScraping, got, Got, PlainResponse } from 'got-scraping';
import { CookieJar } from 'tough-cookie';
import assert from 'assert/strict';
import debug from 'debug';

import util from 'util';
import url from 'url';
import HttpsProxyAgent from 'https-proxy-agent';

import { Socket } from './Socket';

const UserAgent =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.99 Safari/537.36';

export class UserBot {
  public token: string;
  public isLoggedIn: boolean;
  public fingerprint: string;

  protected username: string;
  protected password: string;

  protected cookieJar: CookieJar;
  protected browserClient: Got;
  protected apiClient: Got;

  protected socket: Socket;

  public log: debug.Debugger;

  constructor(username: string, password: string) {
    assert.ok(
      username && typeof username == 'string',
      'username is nil or invalid'
    );
    assert.ok(
      password && typeof password == 'string',
      'password is nil or invalid'
    );

    this.username = username;
    this.password = password;

    this.log = debug(`User:${username}`);

    const cookieJar = new CookieJar();
    this.cookieJar = cookieJar;

    const baseClient = gotScraping.extend({
      headers: {
        'accept-encoding': 'gzip, deflate, br',
        'accept-language': 'en-US,en;q=0.9',

        'user-agent': UserAgent,

        origin: 'https://discord.com',

        'sec-ch-ua': ` Not;A Brand";v="99", "Google Chrome";v="97", "Chromium";v="97`,
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': 'Windows',
      },
      cookieJar: cookieJar,
      retry: {
        limit: 0,
      },
    });

    this.browserClient = baseClient.extend({
      headers: {
        accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',

        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
      },
    });

    this.apiClient = baseClient.extend({
      headers: {
        accept: '*/*',

        authorization: this.token,

        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',

        'x-debug-options': 'bugReporterEnabled',
        'x-discord-locale': 'en-US',
        'x-super-properties':
          'eyJvcyI6IldpbmRvd3MiLCJicm93c2VyIjoiQ2hyb21lIiwiZGV2aWNlIjoiIiwic3lzdGVtX2xvY2FsZSI6ImVuLVVTIiwiYnJvd3Nlcl91c2VyX2FnZW50IjoiTW96aWxsYS81LjAgKFdpbmRvd3MgTlQgMTAuMDsgV2luNjQ7IHg2NCkgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzk3LjAuNDY5Mi45OSBTYWZhcmkvNTM3LjM2IiwiYnJvd3Nlcl92ZXJzaW9uIjoiOTcuMC40NjkyLjk5Iiwib3NfdmVyc2lvbiI6IjEwIiwicmVmZXJyZXIiOiJodHRwczovL3d3dy5nb29nbGUuY29tLyIsInJlZmVycmluZ19kb21haW4iOiJ3d3cuZ29vZ2xlLmNvbSIsInNlYXJjaF9lbmdpbmUiOiJnb29nbGUiLCJyZWZlcnJlcl9jdXJyZW50IjoiaHR0cHM6Ly93d3cuZ29vZ2xlLmNvbS8iLCJyZWZlcnJpbmdfZG9tYWluX2N1cnJlbnQiOiJ3d3cuZ29vZ2xlLmNvbSIsInNlYXJjaF9lbmdpbmVfY3VycmVudCI6Imdvb2dsZSIsInJlbGVhc2VfY2hhbm5lbCI6InN0YWJsZSIsImNsaWVudF9idWlsZF9udW1iZXIiOjExMTY5OSwiY2xpZW50X2V2ZW50X3NvdXJjZSI6bnVsbH0=',
      },
      responseType: 'json',
    });

    this.socket = new Socket(undefined, username);
  }

  get clientState() {
    return this.socket.clientState;
  }

  get isConnected() {
    return this.socket.isConnected;
  }

  get isReady() {
    return this.socket.isReady;
  }

  get isLoggedInAndConnected() {
    return this.isLoggedIn && this.isConnected;
  }

  get isLoggedInAndReady() {
    return this.isLoggedIn && this.isReady;
  }

  private async getFingerprint(): Promise<string> {
    this.log('⚙ Requesting Fingerprint...');

    const res = await this.apiClient.get<{ fingerprint: string }>({
      url: 'https://discord.com/api/v9/experiments',
    });
    assert.ok(res.statusCode == 200, 'request failed');

    const fingerprint: string = res.body?.fingerprint;
    assert.ok(fingerprint, 'no fingerprint found');

    this.log(`✔ Fingerprint Received - Value: ${fingerprint}`);

    return fingerprint;
  }

  public async login(): Promise<string> {
    assert.ok(!this.isLoggedIn, 'already logged in');

    this.log('⚙ Requesting Login...');

    const browserClient = this.browserClient;
    const apiClient = this.apiClient;

    // send request to discord.com to initialize headers
    const res1 = await browserClient.get({
      url: 'https://discord.com',
      headers: {
        accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
        referer: 'https://www.google.com',
      },
    });
    assert.ok(res1.statusCode == 200, 'request failed');

    // login payload
    const loginPayload = {
      login: this.username,
      password: this.password,
      undelete: false,
      captcha_key: null,
      login_source: null,
      gift_code_sku_id: null,
    };

    const fingerprint = await this.getFingerprint();

    // send the actual login request
    const res2 = await apiClient.post<{ token: string }>({
      url: 'https://discord.com/api/v9/auth/login',
      headers: {
        referer: 'https://discord.com/login',
        // for a more realistic request
        'x-fingerprint': fingerprint,
      },
      json: loginPayload,
    });
    assert.ok(res2.statusCode == 200, 'login request failed');

    const token = res2.body?.token;
    assert.ok(token, 'no token');

    this.token = token;
    this.isLoggedIn = true;

    this.fingerprint = fingerprint;

    this.log(`✔ Logged In - Token: ${token}`);

    return token;
  }

  public async logoutAndDisconnect(): Promise<void> {
    assert.ok(this.isLoggedInAndConnected, 'must be logged in and connected');

    this.log('⚙ Requesting Logout...');

    const logoutPayload = {
      provider: null,
      voip_provider: null,
    };
    const res = await this.apiClient.post({
      url: 'https://discord.com/api/v9/auth/logout',
      headers: {
        referer: 'https://discord.com/channels/@me',
        'x-fingerprint': this.fingerprint,
        authorization: this.token,
      },
      json: logoutPayload,
    });
    assert.ok(res.statusCode == 204, 'request failed');

    this.log('✔ Logged Out');

    this.dispose();
  }

  public async loginAndConnect(): Promise<void> {
    assert.ok(!this.isLoggedInAndConnected, 'already logged in and connected');

    this.log('Login and Connect Called');

    const sock = this.socket;
    if (sock.isConnected) {
      sock.dispose();
    }

    const token: string = await this.login();

    sock.token = token;

    const isReady = await sock.connect();
    if (!isReady) {
      this.dispose();
      throw new Error('Socket failed to ready');
    }

    this.log('✔ Connected and Ready');
  }

  public async createPrivateChannel(
    guildId: string,
    guildChannelId: string,
    memberId: string
  ) {
    assert.ok(this.isLoggedInAndReady, 'must be logged in and ready');

    assert.ok(
      guildId && typeof guildId == 'string',
      `param 'guildId' is null or invalid`
    );
    assert.ok(
      guildChannelId && typeof guildChannelId == 'string',
      `param 'guildChannelId' cannot be null`
    );
    assert.ok(
      memberId && typeof memberId == 'string',
      `param 'memberId' cannot be null`
    );

    this.log(`⚙ Requesting Channel to: ${memberId}`);

    const createChannelPayload = {
      recipients: [memberId],
    };
    const res = await this.apiClient.post<{ id: string }>({
      url: 'https://discord.com/api/v9/users/@me/channels',
      headers: {
        authorization: this.token,
        referer: `https://discord.com/channels/${guildId}/${guildChannelId}`,
        'x-fingerprint': this.fingerprint,
      },
      json: createChannelPayload,
    });
    assert.ok(res.statusCode == 200, 'request failed');

    const createdChannelId = res.body?.id;

    this.log(`✔ Created Channel - Channel Id: ${createdChannelId}`);

    return createdChannelId;
  }

  public async deletePrivateChannel(channelId: string): Promise<string> {
    assert.ok(this.isLoggedInAndReady, 'must be logged in and ready');

    assert.ok(
      channelId && typeof channelId == 'string',
      'channelId nil or invalid'
    );

    this.log(`⚙ Requesting Deletion of Channel: ${channelId}`);

    const res = await this.apiClient.delete<{ id: string }>({
      url: `https://discord.com/api/v9/channels/${channelId}`,
      headers: {
        authorization: this.token,
        referer: `https://discord.com/channels/@me`,
        'x-fingerprint': this.fingerprint,
      },
    });
    assert.ok(res.statusCode == 200, 'request failed');

    const deletedChannelId = res.body?.id;
    assert.ok(deletedChannelId, 'no received id');

    this.log('✔ Channel Deleted Successfully');

    return deletedChannelId;
  }

  public async doTyping(channelId: string): Promise<void> {
    assert.ok(this.isLoggedInAndReady, 'must be logged in and ready');

    assert.ok(
      channelId && typeof channelId == 'string',
      'channelId nil or invalid'
    );

    this.log('⚙ Requesting Typing...');

    const res = await this.apiClient.post({
      url: `https://discord.com/api/v9/channels/${channelId}/typing`,
      headers: {
        referer: `https://discord.com/channels/@me/${channelId}`,
        authorization: this.token,
        'x-fingerprint': this.fingerprint,
      },
    });
    assert.ok(res.statusCode == 204, 'request failed');

    this.log('✔ Typed Successfully');
  }

  public async sendMessage(channelId: string, content: string): Promise<void> {
    assert.ok(this.isLoggedInAndReady, 'must be logged in and ready');

    assert.ok(
      channelId && typeof channelId == 'string',
      'channelId nil or invalid'
    );

    assert.ok(
      content && typeof content == 'string' && content.length > 0,
      'content nil, invalid or empty'
    );

    this.log(`⚙ Requesting Message to Channel: ${channelId}`);
    this.log(`📃 Content: ${content.slice(0, 32)}`);

    const messagePayload = {
      content,
      tts: false,
    };
    const res = await this.apiClient.post<{}>({
      url: `https://discord.com/api/v9/channels/${channelId}/messages`,
      headers: {
        referer: `https://discord.com/channels/@me/${channelId}`,
        authorization: this.token,
        'x-fingerprint': this.fingerprint,
      },
      json: messagePayload,
    });
    assert.ok(res.statusCode == 200, 'request failed');

    // TODO: add nonce and verify message sent
    //const nonce = res.body?.nonce;
    //assert.ok(nonce, "no nonce");

    this.log('✔ Message Sent');

    //return nonce;
  }

  public dispose(): void {
    this.log('⚙ Disposing...');

    this.isLoggedIn = false;
    this.token = undefined;
    this.fingerprint = undefined;
    this.socket.dispose();

    this.log('✔ Disposed');
  }
}
