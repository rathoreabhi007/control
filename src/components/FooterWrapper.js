import Footer from './Footer';

export default function FooterWrapper() {
    // For Create React App, we'll show the footer on all pages
    // You can implement React Router later if you need pathname-based logic
    const showFooter = true;

    if (!showFooter) return null;
    return <Footer />;
} 