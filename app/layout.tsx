import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DueDrop",
  applicationName: "DueDrop",
  description: "Turn screenshots into deadlines. Track assignments, applications, and tasks with DueDrop.",
  openGraph: { title: "DueDrop", siteName: "DueDrop", type: "website", description: "Turn screenshots into deadlines. Review extracted tasks, import calendar feeds, and organize what is due next." },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
