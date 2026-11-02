/**
 * Ambient declarations for dependencies that ship no types.
 *
 * `qrcode` and `web-push` are CommonJS packages without a bundled `.d.ts` and
 * without an `@types/*` entry in the lockfile. Declaring only the surface this
 * project actually calls keeps `tsc --noEmit` honest — an untyped `any` module
 * would silently accept a misspelled option such as `errorCorrectionLevel`.
 *
 * `pngjs` and `jsqr` are dev-only: the QR round-trip test rasterises a generated
 * code and decodes the pixels, which is the only way to prove a printed symbol
 * is scannable rather than merely "200 OK".
 */

declare module "qrcode" {
  export type QrErrorCorrectionLevel = "L" | "M" | "Q" | "H";

  export type QrColorOptions = {
    dark?: string;
    light?: string;
  };

  export type QrRenderOptions = {
    /** QR symbol version, 1–40. Omitted means "choose the smallest that fits". */
    version?: number;
    errorCorrectionLevel?: QrErrorCorrectionLevel;
    /** Quiet-zone width in modules. The spec requires at least 4. */
    margin?: number;
    width?: number;
    color?: QrColorOptions;
    type?: "svg" | "png" | "utf8" | "terminal";
  };

  export function toString(text: string, options?: QrRenderOptions): Promise<string>;
  export function toBuffer(text: string, options?: QrRenderOptions): Promise<Buffer>;
  export function toDataURL(text: string, options?: QrRenderOptions): Promise<string>;
}

declare module "web-push" {
  export type PushSubscription = {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };

  export type VapidKeys = {
    publicKey: string;
    privateKey: string;
  };

  export type RequestOptions = {
    /** Seconds the push service should retain the message for an offline device. */
    TTL?: number;
    headers?: Record<string, string>;
    timeout?: number;
    urgency?: "very-low" | "low" | "normal" | "high";
    topic?: string;
  };

  export type SendResult = {
    statusCode: number;
    body: string;
    headers: Record<string, string>;
  };

  export function setVapidDetails(
    subject: string,
    publicKey: string,
    privateKey: string,
  ): void;

  export function generateVAPIDKeys(): VapidKeys;

  export function sendNotification(
    subscription: PushSubscription,
    payload?: string | Buffer | null,
    options?: RequestOptions,
  ): Promise<SendResult>;

  const webpush: {
    setVapidDetails: typeof setVapidDetails;
    generateVAPIDKeys: typeof generateVAPIDKeys;
    sendNotification: typeof sendNotification;
  };
  export default webpush;
}

declare module "pngjs" {
  export type PngData = {
    width: number;
    height: number;
    /** RGBA bytes, 4 per pixel. */
    data: Buffer;
  };

  export class PNG {
    width: number;
    height: number;
    data: Buffer;
    static sync: {
      read(buffer: Buffer): PngData;
      write(data: PngData): Buffer;
    };
  }
}

declare module "jsqr" {
  export type QrCodeLocation = {
    topLeftCorner: { x: number; y: number };
    topRightCorner: { x: number; y: number };
    bottomLeftCorner: { x: number; y: number };
    bottomRightCorner: { x: number; y: number };
  };

  export type QrCode = {
    binaryData: number[];
    data: string;
    location: QrCodeLocation;
  };

  /**
   * Decodes a QR symbol from raw RGBA pixels. Returns `null` when no symbol is
   * readable, which is what the negative control in the test relies on.
   */
  export default function jsQR(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    options?: { inversionAttempts?: "dontInvert" | "onlyInvert" | "attemptBoth" | "invertFirst" },
  ): QrCode | null;
}
