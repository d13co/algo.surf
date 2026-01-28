export enum TXN_TYPES {
  PAYMENT = "pay",
  KEY_REGISTRATION = "keyreg",
  ASSET_CONFIG = "acfg",
  ASSET_TRANSFER = "axfer",
  ASSET_FREEZE = "afrz",
  APP_CALL = "appl",
  STATE_PROOF = "stpf",
  HEARTBEAT = "hb",
}

export enum TEXT_ENCODING {
  JSON = "json",
  BASE64 = "base64",
  TEXT = "text",
  MSG_PACK = "msgpack",
  HEX = "hex",
}

export enum PROGRAM_ENCODING {
  BASE64 = "base64",
  TEAL = "teal",
}

export const TIMESTAMP_DISPLAY_FORMAT = "ddd, dd mmmm  yyyy HH:MM:ss";

export enum Networks {
  "Betanet" = "Betanet",
  "Testnet" = "Testnet",
  "Mainnet" = "Mainnet",
  "Localnet" = "Localnet",
  "Fnet" = "Fnet",
}

export const network =
  Networks[process.env.REACT_APP_NETWORK as keyof typeof Networks];

  if (!network) {
    throw new Error(
      `Invalid REACT_APP_NETWORK value: ${process.env.REACT_APP_NETWORK}`
    );
  }

export const BLOCK_TIME = 2.8;
