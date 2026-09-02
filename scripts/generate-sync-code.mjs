import { createHash, randomBytes } from "node:crypto";

const code = randomBytes(24).toString("base64url");
const hash = createHash("sha256").update(code).digest("hex");

console.log(`KOD_DLA_URZADZEN=${code}`);
console.log(`SYNC_SECRET_HASH=${hash}`);
console.log("Zachowaj pierwszy wiersz. W Cloudflare jako sekret ustaw wyłącznie wartość z drugiego wiersza.");
