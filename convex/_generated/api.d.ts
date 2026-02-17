/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts from "../accounts.js";
import type * as auth from "../auth.js";
import type * as contacts from "../contacts.js";
import type * as conversations from "../conversations.js";
import type * as crons from "../crons.js";
import type * as email from "../email.js";
import type * as gateway from "../gateway.js";
import type * as helpers from "../helpers.js";
import type * as http from "../http.js";
import type * as mcp from "../mcp.js";
import type * as mcpNode from "../mcpNode.js";
import type * as messages from "../messages.js";
import type * as nameReview from "../nameReview.js";
import type * as phoneRegistration from "../phoneRegistration.js";
import type * as templates from "../templates.js";
import type * as tokenExpiry from "../tokenExpiry.js";
import type * as twilioConnect from "../twilioConnect.js";
import type * as webhook from "../webhook.js";
import type * as whatsapp from "../whatsapp.js";
import type * as whatsappDiscovery from "../whatsappDiscovery.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounts: typeof accounts;
  auth: typeof auth;
  contacts: typeof contacts;
  conversations: typeof conversations;
  crons: typeof crons;
  email: typeof email;
  gateway: typeof gateway;
  helpers: typeof helpers;
  http: typeof http;
  mcp: typeof mcp;
  mcpNode: typeof mcpNode;
  messages: typeof messages;
  nameReview: typeof nameReview;
  phoneRegistration: typeof phoneRegistration;
  templates: typeof templates;
  tokenExpiry: typeof tokenExpiry;
  twilioConnect: typeof twilioConnect;
  webhook: typeof webhook;
  whatsapp: typeof whatsapp;
  whatsappDiscovery: typeof whatsappDiscovery;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
