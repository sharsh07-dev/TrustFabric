import { useState, useEffect } from 'react';
import { TrustFabricStorage, type TrustFabricStoreState } from './services/storage';
import { Layout, type NavTab } from './components/Layout';
import { LandingPage } from './components/LandingPage';
import { Overview } from './components/Overview';
import { GrantList } from './components/GrantList';
import { DonationView } from './components/DonationView';
import { FundFlowExplorer } from './components/FundFlowExplorer';
import { EvidenceWorkspace } from './components/EvidenceWorkspace';
import { FindingsList } from './components/FindingsList';
import { DisbursementControl } from './components/DisbursementControl';
import { RedTeamSuite } from './components/RedTeamSuite';
import { AuditTrail } from './components/AuditTrail';
import { DonorPortal } from './components/DonorPortal';
import { ReportsView } from './components/ReportsView';
import { SettingsHealthView } from './components/SettingsHealthView';
import { NgoVerificationDemo } from './components/NgoVerificationDemo';
import { EvidenceService } from './services/evidenceService';
import { type UserRole } from './types/trustfabric';

export function App() {
  const [storage] = useState(() => TrustFabricStorage.getInstance());
  const [evidenceService] = useState(() => new EvidenceService());
  const [storeState, setStoreState] = useState<TrustFabricStoreState | null>(null);

  // Initialize from URL hash or localStorage, defaulting to landing page
  const [activeTab, setActiveTabState] = useState<NavTab>(() => {
    const raw = window.location.hash.replace('#/', '').replace('#', '').trim();
    if (raw === 'landing' || raw === '') return 'landing';
    if (raw === 'ngoverify' || raw === 'ngo') return 'ngoverify';
    if (raw === 'donations' || raw === 'donate') return 'donate';
    if (raw === 'overview') return 'overview';
    if (raw === 'grants') return 'grants';
    if (raw === 'fundflows') return 'fundflows';
    if (raw === 'evidence') return 'evidence';
    if (raw === 'findings') return 'findings';
    if (raw === 'disbursement') return 'disbursement';
    if (raw === 'redteam') return 'redteam';
    if (raw === 'audit') return 'audit';
    if (raw === 'donor') return 'donor';
    if (raw === 'reports') return 'reports';
    if (raw === 'settings') return 'settings';
    
    // Check localStorage fallback if hash is unrecognized
    const saved = localStorage.getItem('trustfabric_active_tab') as NavTab | null;
    return saved || 'landing';
  });

  const setActiveTab = (tab: NavTab) => {
    setActiveTabState(tab);
    localStorage.setItem('trustfabric_active_tab', tab);
    window.location.hash = tab === 'landing' ? '#/' : `#/${tab}`;
  };

  useEffect(() => {
    const handleHashChange = () => {
      const raw = window.location.hash.replace('#/', '').replace('#', '').trim();
      if (raw === '' || raw === 'landing') {
        setActiveTabState('landing');
      } else if (raw === 'ngoverify' || raw === 'ngo') {
        setActiveTabState('ngoverify');
      } else if (raw === 'donations' || raw === 'donate') {
        setActiveTabState('donate');
      } else if (raw === 'overview') {
        setActiveTabState('overview');
      } else if (raw === 'grants') {
        setActiveTabState('grants');
      } else if (raw === 'fundflows') {
        setActiveTabState('fundflows');
      } else if (raw === 'evidence') {
        setActiveTabState('evidence');
      } else if (raw === 'findings') {
        setActiveTabState('findings');
      } else if (raw === 'disbursement') {
        setActiveTabState('disbursement');
      } else if (raw === 'redteam') {
        setActiveTabState('redteam');
      } else if (raw === 'audit') {
        setActiveTabState('audit');
      } else if (raw === 'donor') {
        setActiveTabState('donor');
      } else if (raw === 'reports') {
        setActiveTabState('reports');
      } else if (raw === 'settings') {
        setActiveTabState('settings');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const [isLoading, setIsLoading] = useState(true);

  const [lastUpdated, setLastUpdated] = useState(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

  useEffect(() => {
    async function loadStorage() {
      try {
        const initial = await storage.initialize();
        setStoreState(initial);
        setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      } catch (err) {
        console.error('Storage initialization failed:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadStorage();
  }, [storage]);

  const handleUpdateState = (updated: Partial<TrustFabricStoreState>) => {
    if (!storeState) return;
    const newState = { ...storeState, ...updated };
    setStoreState(newState);
    storage.saveState(updated);
    setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  };

  const handleRefresh = async () => {
    try {
      const refreshed = await storage.initialize();
      setStoreState(refreshed);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err) {
      console.error('Refresh failed:', err);
    }
  };

  const handleResolveFinding = async (findingId: string, actionType: string, reason: string) => {
    if (!storeState) return;
    const isResolved = actionType === 'RESOLVE' || actionType === 'DISMISS_FALSE_POSITIVE';
    const status = isResolved ? ('RESOLVED' as const) : ('INVESTIGATING' as const);

    const updatedFindings = storeState.findings.map(f => {
      if (f.id === findingId) {
        return {
          ...f,
          findingStatus: status,
          actionTaken: `Action [${actionType}] executed: ${reason}`,
        };
      }
      return f;
    });

    // Append cryptographic audit event
    await storage.auditLedger.appendEvent({
      actorRef: `USR-${storeState.currentUserRole.toLowerCase()}-01`,
      actorRole: storeState.currentUserRole,
      action: `FINDING_${actionType}`,
      entityType: 'FINDING',
      entityId: findingId,
      reason: `Finding ${findingId} action: ${actionType}. Reason: ${reason}`,
    });

    const updatedAuditEvents = storage.auditLedger.getEvents();

    handleUpdateState({
      findings: updatedFindings,
      auditEvents: updatedAuditEvents,
    });
  };

  const handleResetSeed = async () => {
    setIsLoading(true);
    try {
      const reset = await storage.resetToDemoSeed();
      setStoreState(reset);
      setActiveTab('overview');
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRoleChange = (role: UserRole) => {
    handleUpdateState({ currentUserRole: role });
    if (role === 'DONOR') {
      setActiveTab('donor');
    }
  };

  if (isLoading || !storeState) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg-app)', color: 'var(--text-secondary)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>🛡️</div>
          <div style={{ fontSize: '15px', fontWeight: 600 }}>Initializing TrustFabric Protocol Node...</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Loading persistent ledger records & cryptographic engines</div>
        </div>
      </div>
    );
  }

  const openFindingsCount = storeState.findings.filter(f => f.findingStatus === 'OPEN').length;

  if (activeTab === 'landing') {
    return (
      <LandingPage
        onNavigate={setActiveTab}
        currentUserRole={storeState.currentUserRole}
        onRoleChange={handleRoleChange}
      />
    );
  }

  return (
    <Layout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      currentUserRole={storeState.currentUserRole}
      onRoleChange={handleRoleChange}
      openFindingsCount={openFindingsCount}
      onResetSeed={handleResetSeed}
      lastUpdated={lastUpdated}
      onRefresh={handleRefresh}
    >
      {activeTab === 'overview' && (
        <Overview
          state={storeState}
          onNavigate={setActiveTab}
          onResolveFinding={handleResolveFinding}
        />
      )}

      {activeTab === 'ngoverify' && (
        <NgoVerificationDemo
          currentUserRole={storeState.currentUserRole}
          onRoleChange={handleRoleChange}
        />
      )}

      {activeTab === 'grants' && (
        <GrantList
          state={storeState}
          onUpdateState={handleUpdateState}
          onSelectGrant={() => setActiveTab('fundflows')}
          onNavigateToDonate={() => setActiveTab('donate')}
        />
      )}

      {activeTab === 'donate' && (
        <DonationView
          state={storeState}
          onUpdateState={handleUpdateState}
          onNavigateToFundFlows={() => setActiveTab('fundflows')}
          onRoleChange={handleRoleChange}
        />
      )}

      {activeTab === 'fundflows' && (
        <FundFlowExplorer state={storeState} />
      )}

      {activeTab === 'evidence' && (
        <EvidenceWorkspace
          state={storeState}
          onUpdateState={handleUpdateState}
          evidenceService={evidenceService}
          duplicateEngine={storage.duplicateEngine}
        />
      )}

      {activeTab === 'findings' && (
        <FindingsList state={storeState} onUpdateState={handleUpdateState} />
      )}

      {activeTab === 'disbursement' && (
        <DisbursementControl
          state={storeState}
          onUpdateState={handleUpdateState}
          escrowMachine={storage.escrowMachine}
        />
      )}

      {activeTab === 'redteam' && (
        <RedTeamSuite />
      )}

      {activeTab === 'audit' && (
        <AuditTrail
          state={storeState}
          auditLedger={storage.auditLedger}
          onUpdateState={handleUpdateState}
        />
      )}

      {activeTab === 'donor' && (
        <DonorPortal state={storeState} />
      )}

      {activeTab === 'reports' && (
        <ReportsView state={storeState} />
      )}

      {activeTab === 'settings' && (
        <SettingsHealthView state={storeState} onUpdateState={handleUpdateState} />
      )}
    </Layout>
  );
}

export default App;
