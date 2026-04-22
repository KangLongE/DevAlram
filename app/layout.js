import "./globals.css";

export const metadata = {
  title: "Dev알람",
  description: "Dev알람 notification dashboard",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
