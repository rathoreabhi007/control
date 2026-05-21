import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './globals.css';
import HomePage from './page';
import CompletenessInstance from './instances/completeness/CompletenessInstance';
import QualityInstance from './instances/quality/QualityInstance';
import ConfigInstance from './instances/config/ConfigInstance';
import WorkflowInstance from './instances/workflow/WorkflowInstance';
import ControlStatusInstance from './instances/control-status/ControlStatusInstance';
import AIAssistantInstance from './instances/ai-assistant/AIAssistantInstance';
import SystemMonitoring from './controls/monitoring/page';
import TransformValidator from './controls/validator/page';
import ControlRunsPage from './controls/control-runs/page';
import AutoConfigDeploymentPage from './controls/auto-config-deployment/page';
import JudgmentAnalyticsPage from './controls/judgment-analytics/page';
import ConfigSearchPage from './controls/config-search/page';
import ConfigValidatorPage from './controls/config-validator/page';
import ReferenceSearchPage from './controls/reference-search/page';
import SupervisoryDashboardPage from './controls/supervisory-dashboard/page';
import InputFileMonitoringInstance from './instances/file-monitoring/InputFileMonitoringInstance';
import OutputFileMonitoringInstance from './instances/file-monitoring/OutputFileMonitoringInstance';
import SupervisoryDetailsPage from './controls/supervisory-dashboard/details-page';
import SupervisoryTrendsPage from './controls/supervisory-trends/page';

import { UserProvider } from './contexts/UserContext';
import UserSwitcher from './components/UserSwitcher';

function App() {
    return (
        <UserProvider>
            <Router>
                <div className="App">
                    <UserSwitcher />
                    <Routes>
                        <Route path="/" element={<HomePage />} />
                        <Route path="/instances/completeness/:id" element={<CompletenessInstance />} />
                        <Route path="/instances/quality/:id" element={<QualityInstance />} />
                        <Route path="/instances/config/:id" element={<ConfigInstance />} />
                        <Route path="/instances/workflow/:id" element={<WorkflowInstance />} />
                        <Route path="/instances/control-status/:id" element={<ControlStatusInstance />} />
                        <Route path="/instances/ai-assistant/:id" element={<AIAssistantInstance />} />
                        <Route path="/ai-assistant" element={<AIAssistantInstance />} />
                        <Route path="/control-status" element={<ControlStatusInstance />} />
                        <Route path="/control-runs" element={<ControlRunsPage />} />
                        <Route path="/auto-config-deployment" element={<AutoConfigDeploymentPage />} />
                        <Route path="/monitoring" element={<SystemMonitoring />} />
                        <Route path="/validator" element={<TransformValidator />} />
                        <Route path="/judgment-analytics" element={<JudgmentAnalyticsPage />} />
                        <Route path="/config-search" element={<ConfigSearchPage />} />
                        <Route path="/config-validator" element={<ConfigValidatorPage />} />
                        <Route path="/reference-search" element={<ReferenceSearchPage />} />
                        <Route path="/supervisory-dashboard" element={<SupervisoryDashboardPage />} />
                        <Route path="/supervisory-dashboard/details" element={<SupervisoryDetailsPage />} />
                        <Route path="/supervisory-trends" element={<SupervisoryTrendsPage />} />
                        <Route path="/input-file-monitoring" element={<InputFileMonitoringInstance />} />
                        <Route path="/output-file-monitoring" element={<OutputFileMonitoringInstance />} />
                    </Routes>
                </div>
            </Router>
        </UserProvider>
    );
}

export default App;
