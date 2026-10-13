import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Syscall Lab · System Call Simulator",
  description: "Explore file descriptors, processes and the user / kernel boundary through an interactive system call simulator.",
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
      <body className="antialiased">{children}</body>
    </html>
  );
}
