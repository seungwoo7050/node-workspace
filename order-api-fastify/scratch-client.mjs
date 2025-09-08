import WebSocket from "ws";

const ws = new WebSocket("ws://localhost:4000/ws");
ws.on("open", () => console.log("연결됨"));
ws.on("message", (data) => console.log("받음:", data.toString()));
