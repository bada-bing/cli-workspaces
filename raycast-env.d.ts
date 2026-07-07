/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Sessions - Comma-separated session names, a JSON array of names, or a path to a JSON file. JSON array items can be strings or objects with { "name": string, "description"?: string }. */
  "sessions": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `open` command */
  export type Open = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `open` command */
  export type Open = {}
}


