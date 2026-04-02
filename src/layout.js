import "./globals.css";
import FooterWrapper from "./components/FooterWrapper";

// For Create React App, metadata is handled in public/index.html
// This component is now just a wrapper component

export default function RootLayout({ children }) {
  return (
    <div>
      {children}
      <FooterWrapper />
    </div>
  );
}
