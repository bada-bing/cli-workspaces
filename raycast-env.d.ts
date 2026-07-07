/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Sessions File - Path to a JSON file containing the list of sessions. Items can be strings or objects with { "name": string, "description"?: string, "dir"?: string }. */
  "sessionsFile": string
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


