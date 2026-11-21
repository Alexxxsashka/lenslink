import { PeerServer } from "peer";
const server = PeerServer({
  port: 9001,
  path: "/peerjs",
  host: "127.0.0.1",
  allow_discovery: false,
});
console.log("Test signaling listening on 127.0.0.1:9001");
process.on("SIGTERM", () => server.close());
