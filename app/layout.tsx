import "./globals.css";
import type { Metadata } from "next";
import { ToastContainer } from "@/components/ui/Toast";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { Lightbox } from "@/components/ui/Lightbox";

export const metadata: Metadata = {
  title: "Chat AI · Streaming",
  description: "Chat streaming multi-provider dengan vision & image generation",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className="dark">
      <body className="antialiased bg-neutral-950 text-neutral-100">
        <ErrorBoundary>{children}</ErrorBoundary>
        <Lightbox />
        <ToastContainer />
      </body>
    </html>
  );
}