import { createRouter } from "sv-router";
import Landing from "./routes/Landing.svelte";
import Home from "./routes/Home.svelte";
import Sessions from "./routes/Sessions.svelte";
import Thread from "./routes/Thread.svelte";
import Settings from "./routes/Settings.svelte";
import Device from "./routes/Device.svelte";

export const { navigate, route } = createRouter({
  "/": Landing,
  "/app": Home,
  "/sessions": Sessions,
  "/thread/:id": Thread,
  "/settings": Settings,
  "/device": Device,
});
