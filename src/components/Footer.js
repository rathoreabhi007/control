const Footer = () => {
    return (
        <footer className="relative border-t border-slate-800" style={{ backgroundColor: '#343434' }}>
            <div className="absolute inset-0 -z-10 transform-gpu overflow-hidden blur-3xl">
                <div className="relative aspect-[1155/678] w-full bg-gradient-to-tr from-emerald-400 to-cyan-400 opacity-20" />
            </div>

            <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">About Controls</h3>
                        <ul className="space-y-2">
                            <li><a href="#" className="text-white hover:text-gray-300 transition-colors">Overview</a></li>
                            <li><a href="#" className="text-white hover:text-gray-300 transition-colors">Features</a></li>
                            <li><a href="#" className="text-white hover:text-gray-300 transition-colors">Documentation</a></li>
                        </ul>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Team</h3>
                        <ul className="space-y-2">
                            <li><a href="#" className="text-white hover:text-gray-300 transition-colors">Leadership</a></li>
                            <li><a href="#" className="text-white hover:text-gray-300 transition-colors">Engineering</a></li>
                            <li><a href="#" className="text-white hover:text-gray-300 transition-colors">Support</a></li>
                        </ul>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Contact</h3>
                        <ul className="space-y-2">
                            <li className="text-white">
                                <span className="text-white">Email:</span><br />
                                support@controls.com
                            </li>
                            <li className="text-white">
                                <span className="text-white">Technical:</span><br />
                                tech@controls.com
                            </li>
                            <li className="text-white">
                                <span className="text-white">Sales:</span><br />
                                sales@controls.com
                            </li>
                        </ul>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Legal</h3>
                        <ul className="space-y-2">
                            <li><a href="#" className="text-white hover:text-gray-300 transition-colors">License</a></li>
                            <li><a href="#" className="text-white hover:text-gray-300 transition-colors">Privacy Policy</a></li>
                            <li><a href="#" className="text-white hover:text-gray-300 transition-colors">Terms of Service</a></li>
                        </ul>
                    </div>
                </div>

                <div className="mt-8 border-t border-slate-800 pt-8">
                    <div className="text-center space-y-4">
                        <p className="text-white text-sm">
                            © {new Date().getFullYear()} Generic Control Dashboard. All rights reserved.
                        </p>
                        <p className="text-white text-xs px-4 max-w-3xl mx-auto">
                            All content, features, and functionality contained within this dashboard are the exclusive property of Generic Control Dashboard and are protected by international copyright and intellectual property laws. Any unauthorized reproduction, distribution, or modification of the content is strictly prohibited. All trademarks, service marks, and trade names referenced herein are the property of their respective owners.
                        </p>
                        <p className="text-white text-sm">
                            Version 1.0.0
                        </p>
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default Footer; 