import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      twoFactorEnabled: boolean;
      mustChangePassword: boolean;
      sessionVersion: number;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role: string;
    twoFactorEnabled: boolean;
    mustChangePassword: boolean;
    sessionVersion: number;
  }
}
