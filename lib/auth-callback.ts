import "server-only";
import { NextRequest } from "next/server";
import { confirmAuth as confirm, stageAuth } from "./auth-handlers";
export { stageAuth };
export const confirmAuth = (request: NextRequest) => confirm(request, { secret: process.env.AUTH_RECOVERY_SECRET });
