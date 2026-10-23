import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hylia · El plan también puede inspirar",
  description: "Ideas, contenido y equipo. Todo conectado en un calendario visual.",
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
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
