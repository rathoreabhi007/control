import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaChartLine, FaCheckCircle, FaCog, FaServer, FaDesktop, FaFlask, FaRobot, FaChartBar, FaSearch, FaFileAlt, FaDatabase } from 'react-icons/fa';
import './globals.css';
import HSBCLogo from './components/HSBCLogo';
import { useUser } from './contexts/UserContext';

function HomePage() {
  const [activeSection, setActiveSection] = useState(null);
  const [hoveredSection, setHoveredSection] = useState(null);
  const { currentUser, hasAccess, loading } = useUser();

  const userKey = (currentUser?.username || currentUser?.email || currentUser?.name || 'anonymous').toString();
  const recentCompletenessKey = `recent_instances:completeness:${userKey}`;
  const recentQualityKey = `recent_instances:quality:${userKey}`;

  const readRecent = useCallback((key) => {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
    } catch {
      return [];
    }
  }, []);

  const readRecentWithFallback = useCallback((primaryKey, fallbackKeys) => {
    const primary = readRecent(primaryKey);
    if (primary.length > 0) return { items: primary, sourceKey: primaryKey };

    for (const k of (Array.isArray(fallbackKeys) ? fallbackKeys : [])) {
      if (!k || k === primaryKey) continue;
      const v = readRecent(k);
      if (v.length > 0) return { items: v, sourceKey: k };
    }

    return { items: [], sourceKey: primaryKey };
  }, [readRecent]);

  const [recentCompleteness, setRecentCompleteness] = useState(() => readRecent(recentCompletenessKey));
  const [recentQuality, setRecentQuality] = useState(() => readRecent(recentQualityKey));

  useEffect(() => {
    // refresh on user change / after user finishes loading
    const completenessFallbackKeys = [
      'recent_instances:completeness:true',
      'recent_instances:completeness:false',
      'recent_instances:completeness:anonymous'
    ];
    const qualityFallbackKeys = [
      'recent_instances:quality:true',
      'recent_instances:quality:false',
      'recent_instances:quality:anonymous'
    ];

    const syncFromStorage = () => {
      const c = readRecentWithFallback(recentCompletenessKey, completenessFallbackKeys);
      const q = readRecentWithFallback(recentQualityKey, qualityFallbackKeys);

      setRecentCompleteness(c.items);
      setRecentQuality(q.items);

      // One-way migrate legacy keys (e.g. :true/:false) into correct per-user key
      try {
        if (c.items.length > 0 && c.sourceKey !== recentCompletenessKey) {
          localStorage.setItem(recentCompletenessKey, JSON.stringify(c.items.slice(0, 5)));
        }
      } catch { }
      try {
        if (q.items.length > 0 && q.sourceKey !== recentQualityKey) {
          localStorage.setItem(recentQualityKey, JSON.stringify(q.items.slice(0, 5)));
        }
      } catch { }
    };

    syncFromStorage();

    const refresh = () => {
      syncFromStorage();
    };

    const onStorage = (e) => {
      if (!e?.key) return;
      if (
        e.key === recentCompletenessKey ||
        e.key === recentQualityKey ||
        e.key === 'recent_instances:completeness:true' ||
        e.key === 'recent_instances:completeness:false' ||
        e.key === 'recent_instances:completeness:anonymous' ||
        e.key === 'recent_instances:quality:true' ||
        e.key === 'recent_instances:quality:false' ||
        e.key === 'recent_instances:quality:anonymous'
      ) {
        refresh();
      }
    };

    const onFocus = () => refresh();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [recentCompletenessKey, recentQualityKey, loading, readRecentWithFallback]);

  const openNewInstance = useCallback((type) => {
    // Generate a unique ID using timestamp and random number
    const uniqueId = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    // Open the instance page in a new tab
    window.open(`/instances/${type}/${uniqueId}`, '_blank');
  }, []);

  const openExistingInstance = useCallback((type, instanceId) => {
    if (!instanceId) return;
    window.open(`/instances/${type}/${instanceId}`, '_blank');
  }, []);

  const copyText = useCallback((text) => {
    const value = String(text || '');
    if (!value) return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(value).catch(() => { });
    }
  }, []);

  const openMonitoring = useCallback(() => window.open('/monitoring', '_blank'), []);

  const openValidator = useCallback(() => window.open('/validator', '_blank'), []);

  const openControlStatus = useCallback(() => window.open('/control-status', '_blank'), []);

  const openControlRuns = useCallback(() => window.open('/control-runs', '_blank'), []);

  const openAutoConfigDeployment = useCallback(() => window.open('/auto-config-deployment', '_blank'), []);

  const openAIAssistant = useCallback(() => window.open('/ai-assistant', '_blank'), []);

  const openJudgmentAnalytics = useCallback(() => window.open('/judgment-analytics', '_blank'), []);

  const openConfigSearch = useCallback(() => window.open('/config-search', '_blank'), []);

  const openConfigValidator = useCallback(() => window.open('/config-validator', '_blank'), []);

  const openSupervisoryDashboard = useCallback(() => window.open('/supervisory-dashboard', '_blank'), []);

  const openSupervisoryTrends = useCallback(() => window.open('/supervisory-trends', '_blank'), []);

  const openReferenceSearch = useCallback(() => window.open('/reference-search', '_blank'), []);

  const controlsTowerItems = useMemo(() => ([
    {
      title: 'Control Execution Status',
      description: 'Real-time dashboard for monitoring control run status and performance. Analyse run status and execution trends including filtering by regulation, asset class, and control type.',
      icon: FaChartLine,
      accessKey: 'control-status',
      onClick: openControlStatus
    },
    {
      title: 'Control Input File Monitoring',
      description: 'Real-time dashboard for monitoring expected vs actual arrival status of control input files. Analyse status and trends including filtering by regulation, asset class, and control type.',
      icon: FaDatabase,
      onClick: () => window.open('/input-file-monitoring', '_blank')
    },
    {
      title: 'Control Output Health Monitoring',
      description: 'Dashboard of automated daily regression testing and integrity checks on the outputs of the Controls Platform. Provide a final layer of assurance, detecting systemic issues, data processing errors, or unexpected deviations from established operational baselines.',
      icon: FaChartLine,
      onClick: () => window.open('/output-file-monitoring', '_blank')
    },
    {
      title: 'System Health Monitoring',
      description: 'Provides real-time dashboards for monitoring DHP KVM virtual servers\' health and performance, tracking key metrics like CPU, memory, and resource utilization to ensure system stability.',
      icon: FaDesktop,
      accessKey: 'monitoring',
      onClick: openMonitoring
    }
  ]), [openControlStatus, openMonitoring]);

  const controlsWorkbenchItems = useMemo(() => ([
    {
      title: 'Completeness Workbench',
      description: 'Build and test full outer-join population reconciliation controls to verify data completeness between source and target systems.',
      icon: FaCheckCircle,
      accessKey: 'completeness',
      onClick: () => {
        if (typeof hasAccess === 'function' && !hasAccess('completeness')) return;
        openNewInstance('completeness');
      },
      recentItems: recentCompleteness,
      recentType: 'completeness'
    },
    {
      title: 'QA Workbench',
      description: 'Build and test attribute-level accuracy and validity tests to ensure data integrity back to source as well as Collateral and Valuations Daily Submission completeness. Also used for data Pre-Processing.',
      icon: FaChartLine,
      accessKey: 'quality',
      onClick: () => {
        if (typeof hasAccess === 'function' && !hasAccess('quality')) return;
        openNewInstance('quality');
      },
      recentItems: recentQuality,
      recentType: 'quality'
    },
    {
      title: 'Controls Runner',
      description: 'Run Controls in batch mode. Includes real-time execution monitoring, detailed logging, run history, and comprehensive status tracking.',
      icon: FaServer,
      accessKey: 'control-run',
      onClick: openControlRuns
    }
  ]), [hasAccess, openControlRuns, openNewInstance, recentCompleteness, recentQuality]);

  const controlConfigurationItems = useMemo(() => ([
    {
      title: 'Configuration Function Simulator',
      description: 'An interactive tool for rapidly testing and validating data transformation logic. Instantly execute functions and formulas on sample data to analyze results before deployment.',
      icon: FaFlask,
      accessKey: 'validator',
      onClick: openValidator
    },
    {
      title: 'Configuration Explorer',
      description: 'A powerful global search engine to instantly find and analyse logic across the entire library of control configurations, including rules, enrichments, and transformations.',
      icon: FaSearch,
      accessKey: 'config',
      onClick: openConfigSearch
    },
    {
      title: 'Configuration Validator',
      description: 'A pre-deployment validation service that scans configuration files for syntax errors, missing values, and invalid references, providing detailed reports to ensure quality.',
      icon: FaFileAlt,
      accessKey: 'config',
      onClick: openConfigValidator
    },
    {
      title: 'Configuration AI Assistant',
      description: 'A generative AI-powered chat assistant trained on the Controls Framework. Accelerates configuration development by generating rules, formulas, and logic in seconds.',
      icon: FaRobot,
      accessKey: 'ai-assistant',
      onClick: openAIAssistant
    },
    {
      title: 'Configuration Auto-Deployer',
      description: 'A utility to automatically deploy control configurations to Production after first checking the config runs successfully using a sample subset of the input data; complete with real-time logging and status tracking.',
      icon: FaCog,
      accessKey: 'auto-config-deployment',
      onClick: openAutoConfigDeployment
    },
    {
      title: 'Data Analyzer',
      description: 'A visual, drag-and-drop workflow builder for designing and prototyping complex data pipelines and ETL processes without writing code. Primarily used for building temporary test harnesses for testing complex code changes to the platform.',
      icon: FaChartLine,
      accessKey: 'workflow',
      onClick: () => openNewInstance('workflow')
    },
    {
      title: 'Refernce Search',
      description: 'A utility to automatically deploy control configurations to Production after first checking the config runs successfully using a sample subset of the input data; complete with real-time logging and status tracking.',
      icon: FaCog,
      accessKey: 'auto-config-deployment',
      onClick: openReferenceSearch,
    },
  ]), [openAIAssistant, openAutoConfigDeployment, openConfigSearch, openConfigValidator, openReferenceSearch, openValidator, openNewInstance]);

  const aiOpsOversightItems = useMemo(() => ([
    {
      title: 'Controls Configuration AI Assistant Performance Analytics',
      description: 'An automated quality assurance module that evaluates the performance and accuracy of the GenAI Config Assistant responses, providing analytics on its accuracy and other key metrics.',
      icon: FaChartBar,
      accessKey: 'judgment-analytics',
      onClick: openJudgmentAnalytics
    }
  ]), [openJudgmentAnalytics]);

  const operationalGovernanceItems = useMemo(() => ([
    {
      title: 'Supervisory Dashboard',
      description: 'Monitor, prioritize, and manage the remediation of control breaks. Features aged break analysis and dynamic pivot-table aggregations.',
      icon: FaChartBar,
      onClick: openSupervisoryDashboard
    },
    {
      title: 'Supervisory Trends',
      description: 'Time-series remediation analysis with grouped pivot tables and remediation-plan charts.',
      icon: FaChartLine,
      onClick: openSupervisoryTrends
    }
  ]), [openSupervisoryDashboard, openSupervisoryTrends]);

  const sectionsWithAccess = useMemo(() => {
    const sections = [
      {
        name: 'Controls Tower',
        description: 'A suite of dashboards providing visibility into control execution status as well as underlying platform and system health.',
        items: controlsTowerItems
      },
      {
        name: 'Controls Workbench',
        description: 'A dedicated environment for authoring, testing, and managing the business logic for all controls, providing specialized modules for different control types.',
        items: controlsWorkbenchItems
      },
      {
        name: 'Control Configuration Toolbox',
        description: 'A comprehensive suite of integrated tools designed to streamline and accelerate the entire lifecycle of creating, testing, and deploying configurations for Controls. It empowers configuration authors to build robust and accurate control logic with maximum efficiency and confidence.',
        items: controlConfigurationItems
      },
      {
        name: 'AI Ops Oversight',
        description: 'Automated quality assurance capabilities that evaluate the performance and accuracy of GenAI assistants used within TnTR Ops.',
        items: aiOpsOversightItems
      },
      {
        name: 'Operational Governance Dashboard',
        description: 'An interactive dashboard for TnTR Operations to monitor, prioritize, and manage the day-to-day operational effort of Control Output explains and remediation.',
        items: operationalGovernanceItems
      }
    ];

    const canSee = (item) => {
      if (!item?.accessKey) return true;
      if (typeof hasAccess !== 'function') return true;
      // While loading, avoid hiding everything (prevents empty home page flash)
      if (loading) return true;
      return hasAccess(item.accessKey);
    };

    return sections
      .map((section) => ({
        ...section,
        items: Array.isArray(section.items) ? section.items.filter(canSee) : []
      }))
      .filter((section) => Array.isArray(section.items) && section.items.length > 0);
  }, [
    hasAccess,
    loading,
    controlsTowerItems,
    controlsWorkbenchItems,
    controlConfigurationItems,
    aiOpsOversightItems,
    operationalGovernanceItems
  ]);

  const visibleSectionName = hoveredSection || activeSection;
  const visibleSection = sectionsWithAccess.find((section) => section.name === visibleSectionName);

  return (
    <div className="relative isolate min-h-screen controls-hub-typography" style={{ backgroundColor: '#F5F5F5', color: 'black' }}>
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50" style={{ backgroundColor: '#ffffff' }}>
        <div className="max-w-7xl mx-auto px-8">
          <div className="flex items-center justify-between h-16 px-0">
            <div className="flex items-center flex-shrink-0">
              <HSBCLogo height={64} className="mr-2" />
            </div>

            {/* Desktop menu only */}
            <div className="flex items-center space-x-8">
              <a href="#features" className="text-black hover:text-slate-700 transition-colors">Features</a>
              <button className="text-black hover:text-slate-700 transition-colors bg-transparent border-none cursor-pointer">Documentation</button>
              <button className="text-black hover:text-slate-700 transition-colors bg-transparent border-none cursor-pointer">Support</button>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex flex-col min-h-screen">
        {/* Hero section with desktop-optimized padding */}
        <div className="px-8 pt-32 pb-12">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-6xl font-bold tracking-tight text-black">
              Controls Hub
            </h1>
            <p className="mt-6 text-lg leading-8 text-black">
              An integrated platform for the end-to-end lifecycle of Trade and Transaction Regulatory Reporting Controls. The Hub provides a suite of tools for authoring, executing, monitoring, and analysing data completeness and quality assurance controls to ensure reporting completeness, validity, and accuracy.
            </p>
          </div>
        </div>

        {/* Features section with desktop-optimized layout */}
        <div
          id="features"
          className="controls-landscape-wrap mx-auto w-full max-w-[1800px] px-8 pb-24"
          onMouseLeave={() => {
            if (!activeSection) setHoveredSection(null);
          }}
        >
          <div className="mb-4 text-sm text-slate-700">Hover or click a section card to view its pages.</div>
          <div className="controls-parent-grid">
            {sectionsWithAccess.map((section) => (
              <button
                type="button"
                key={section.name}
                onMouseEnter={() => setHoveredSection(section.name)}
                onClick={() => setActiveSection((current) => (current === section.name ? null : section.name))}
                className={`controls-parent-card ${visibleSectionName === section.name ? 'controls-parent-card-active' : ''
                  }`}
                aria-pressed={visibleSectionName === section.name}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-3 rounded-lg bg-white text-red-500">
                    <FaCog size={24} />
                  </div>
                  <span className="controls-item-count">{section.items.length}</span>
                  <h2 className="text-xl font-bold text-black leading-tight">{section.name}</h2>
                </div>
                <p className="controls-parent-desc text-black text-sm leading-6 text-left">{section.description}</p>
              </button>
            ))}
          </div>

          {visibleSection && (
            <div className="controls-subpanel controls-subpanel-animate mt-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-bold text-black">{visibleSection.name}</h3>
                <button
                  type="button"
                  className="text-sm text-slate-700 bg-white border border-slate-300 rounded px-3 py-1"
                  onClick={() => {
                    setActiveSection(null);
                    setHoveredSection(null);
                  }}
                >
                  Close
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {visibleSection.items.map((item, index) => {
                  const Icon = item.icon;
                  const isClickable = Boolean(item.onClick);
                  return (
                    <div
                      key={item.title}
                      onClick={item.onClick}
                      style={{ animationDelay: `${index * 70}ms` }}
                      className={`rounded-lg border border-slate-200 p-5 transition-all duration-300 ease-in-out bg-white ${isClickable
                        ? 'cursor-pointer hover:scale-[1.02] hover:shadow-xl hover:shadow-slate-700/10 transform-gpu'
                        : 'cursor-default'
                        } controls-subcard-animate`}
                    >
                      <div className="flex items-center gap-4 mb-3">
                        <div className="p-2 rounded-lg bg-white text-red-500 transition-colors">
                          <Icon size={24} />
                        </div>
                        <h4 className="text-lg font-semibold text-black">{item.title}</h4>
                      </div>
                      <p className="text-black text-sm leading-6">{item.description}</p>

                      {Array.isArray(item.recentItems) && item.recentItems.length > 0 && item.recentType && (
                        <div
                          className="mt-4 pt-4 border-t border-slate-200"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">
                            Recent instances
                          </div>
                          <div className="space-y-2">
                            {item.recentItems.slice(0, 5).map((ri) => (
                              <div
                                key={ri.instanceId}
                                className="flex items-stretch rounded border border-slate-200 overflow-hidden"
                              >
                                <button
                                  type="button"
                                  onClick={() => openExistingInstance(item.recentType, ri.instanceId)}
                                  className="flex-1 text-left px-3 py-2 hover:bg-slate-50"
                                  title={ri.instanceId}
                                >
                                  <div className="text-xs font-semibold text-slate-900 truncate">
                                    {ri.instanceId}
                                  </div>
                                  {ri.lastVisitedAt && (
                                    <div className="text-[11px] text-slate-600">
                                      {new Date(ri.lastVisitedAt).toLocaleString()}
                                    </div>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => copyText(ri.instanceId)}
                                  className="px-3 text-xs font-bold text-slate-700 hover:bg-slate-100 border-l border-slate-200"
                                  title="Copy instance id"
                                >
                                  Copy
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openExistingInstance(item.recentType, ri.instanceId)}
                                  className="px-3 text-xs font-bold text-blue-700 hover:bg-blue-50 border-l border-slate-200"
                                  title="Open in new tab"
                                >
                                  Open
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default HomePage;
