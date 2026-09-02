import type { Metadata } from "next";
import "./globals.css";
import "./report.css";
import "./scene.css";
import "./leaderboard.css";
import "./leaderboard-fix.css";
import "./three.css";

export const metadata: Metadata = {
  title: "Agent Escape Room",
  description: "A WebMCP-native mystery built to test autonomous AI agents.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta httpEquiv="origin-trial" content="ArOJ+b/HGuMtFf3VaPUFgc0ItryuHWFOKs5AYP95C0L2WwMBLBkT/46bHc3YKfeQ9HRC6JlguWl80afPAdxevwoAAABreyJvcmlnaW4iOiJodHRwczovL2FnZW50LWVzY2FwZS1yb29tLmJlaHVtYmxlMTkwNy5jaGF0Z3B0LnNpdGU6NDQzIiwiZmVhdHVyZSI6IldlYk1DUCIsImV4cGlyeSI6MTc5NDg3MzYwMH0=" />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
