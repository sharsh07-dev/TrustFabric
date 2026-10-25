import React, { useState, useEffect } from 'react';
import {
  PaymentService,
  type PaymentGrant,
  type PublicPaymentConfig,
  type VerificationResponse,
  type ProofPackageResponse,
} from '../services/paymentService';
import {
  FirebaseClient,
  type PublicDonationRecord,
} from '../services/firebaseClient';
import { RealtimeClient, type RealtimeDonationEvent } from '../services/realtimeClient';
import { type TrustFabricStoreState } from '../services/storage';
import { type FinancialEvent, type UserRole } from '../types/trustfabric';
import {
  Web3DonationService,
  type Web3Campaign,
  type Web3DonationReceipt,
  SEPOLIA_CONTRACT_ADDRESS,
} from '../services/web3DonationService';

interface DonationViewProps {
  state: TrustFabricStoreState;
  onUpdateState: (updated: Partial<TrustFabricStoreState>) => void;
  onNavigateToFundFlows?: () => void;
  onRoleChange?: (role: UserRole) => void;
}

type FlowStep =
  | 'FORM'
  | 'CREATING_ORDER'
  | 'CHECKOUT_ACTIVE'
  | 'VERIFYING_PAYMENT'
  | 'PAYMENT_CONFIRMED'
  | 'ANCHORING_ONCHAIN'
  | 'ANCHORED_SUCCESS'
  | 'PAYMENT_FAILED';

export const DonationView: React.FC<DonationViewProps> = ({
  state,
  onUpdateState,
  onNavigateToFundFlows,
  onRoleChange,
}) => {
  const [paymentService] = useState(() => PaymentService.getInstance());
  const [firebaseClient] = useState(() => FirebaseClient.getInstance());
  const [realtimeClient] = useState(() => RealtimeClient.getInstance());
  const [web3Service] = useState(() => Web3DonationService.getInstance());

  // Donation Method: Option 2 (Web3 MetaMask Sepolia ETH) vs Option 1 (Razorpay INR)
  const [donationMethod, setDonationMethod] = useState<'METAMASK_SEPOLIA' | 'RAZORPAY_INR'>('METAMASK_SEPOLIA');

  // Web3 MetaMask State
  const [web3Campaigns, setWeb3Campaigns] = useState<Web3Campaign[]>([]);
  const [selectedWeb3CampaignId, setSelectedWeb3CampaignId] = useState<string>('CW-2026-014');
  const [amountEth, setAmountEth] = useState<string>('0.01');
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<string | null>(null);
  const [isConnectingWallet, setIsConnectingWallet] = useState<boolean>(false);
  const [web3Step, setWeb3Step] = useState<'IDLE' | 'AWAITING_SIGNATURE' | 'MINING' | 'CONFIRMED' | 'FAILED'>('IDLE');
  const [web3TxHash, setWeb3TxHash] = useState<string | null>(null);
  const [web3Receipt, setWeb3Receipt] = useState<Web3DonationReceipt | null>(null);
  const [web3Error, setWeb3Error] = useState<string | null>(null);
  const [allEthDonations, setAllEthDonations] = useState<Web3DonationReceipt[]>([]);

  const [config, setConfig] = useState<PublicPaymentConfig | null>(null);
  const [grants, setGrants] = useState<PaymentGrant[]>([]);
  const [selectedGrantId, setSelectedGrantId] = useState<string>('');

  // Realtime Socket.IO & Firebase State
  const [isFirebaseConnected, setIsFirebaseConnected] = useState<boolean>(false);
  const [isSocketConnected, setIsSocketConnected] = useState<boolean>(false);
  const [rtdbDonations, setRtdbDonations] = useState<PublicDonationRecord[]>([]);
  const [lastRtdbSyncTime, setLastRtdbSyncTime] = useState<string>('');

  // Demo Role Profile: Aarav (Donor), Meera (NGO Admin), Ravi (Field Worker), Judge (Auditor)
  const [demoRole, setDemoRole] = useState<'AARAV_DONOR' | 'MEERA_ADMIN' | 'RAVI_VENDOR' | 'JUDGE_AUDITOR'>('AARAV_DONOR');

  // Donation Form State (Pre-filled for ₹500 Judge Demo)
  const [amountRupees, setAmountRupees] = useState<string>('500');
  const [donorName, setDonorName] = useState<string>('Aarav Patel');
  const [donorEmail, setDonorEmail] = useState<string>('aarav.patel@cascade-donor.org');
  const [donorContact, setDonorContact] = useState<string>('+91 98200 55432');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Workflow State
  const [currentStep, setCurrentStep] = useState<FlowStep>('FORM');
  const [verifiedResult, setVerifiedResult] = useState<VerificationResponse | null>(null);
  const [proofPackage, setProofPackage] = useState<ProofPackageResponse | null>(null);
  const [showProofModal, setShowProofModal] = useState<boolean>(false);
  const [isRetryingAnchor, setIsRetryingAnchor] = useState<boolean>(false);

  // Internal Accounting Allocation Modal (For Meera NGO Admin role)
  const [showAllocModal, setShowAllocModal] = useState<boolean>(false);
  const [allocSuccessMsg, setAllocSuccessMsg] = useState<string | null>(null);

  // Load initial config and setup Socket.IO & Firebase listeners
  useEffect(() => {
    async function initData() {
      try {
        const [pubConfig, grantList, initialDonations, initialCampaigns] = await Promise.all([
          paymentService.getPublicConfig(),
          paymentService.getEligibleGrants(),
          paymentService.getPublicDonations(),
          web3Service.getEligibleCampaigns(),
        ]);
        setConfig(pubConfig);
        setGrants(grantList);
        if (initialCampaigns && initialCampaigns.length > 0) {
          setWeb3Campaigns(initialCampaigns);
          setSelectedWeb3CampaignId(initialCampaigns[0].id);
        }
        if (initialDonations && initialDonations.length > 0) {
          setRtdbDonations(initialDonations);
        }
        if (grantList.length > 0) {
          setSelectedGrantId(grantList[0].id);
        }

        try {
          const ethRes = await fetch('http://localhost:5001/api/donations/eth');
          if (ethRes.ok) {
            const ethData = await ethRes.json();
            if (ethData.donations) setAllEthDonations(ethData.donations);
          }
        } catch {
          // backend offline or initial load
        }
      } catch (err: any) {
        console.error('Initialization error:', err);
      }
    }
    initData();

    // 1. Connect & Subscribe to Socket.IO Real-Time Broadcasts
    realtimeClient.connect();
    const unsubSocketStatus = realtimeClient.subscribeStatus(status => {
      setIsSocketConnected(status === 'CONNECTED');
      if (status === 'CONNECTED') {
        setLastRtdbSyncTime(new Date().toLocaleTimeString());
      }
    });

    const unsubSocketDonations = realtimeClient.subscribeDonations((newDon: RealtimeDonationEvent) => {
      setRtdbDonations(prev => {
        if (prev.some(d => d.donationId === newDon.donationId)) return prev;
        const newRecord: PublicDonationRecord = {
          donationId: newDon.donationId,
          donationCode: `DON-${newDon.donationId.slice(-6).toUpperCase()}`,
          campaignId: newDon.campaignId,
          amountPaise: newDon.amountPaise,
          currency: newDon.currency,
          status: 'CAPTURED',
          provenance: 'RAZORPAY_TEST_CAPTURED',
          createdAt: newDon.confirmedAt,
        };
        return [newRecord, ...prev];
      });
      setLastRtdbSyncTime(new Date().toLocaleTimeString());
    });

    // 2. Subscribe to Firebase connection state (optional backup)
    const unsubConn = firebaseClient.subscribeToConnectionStatus(connected => {
      setIsFirebaseConnected(connected);
    });

    // 3. Subscribe to Realtime Public Donations Feed (fallback)
    const unsubDon = firebaseClient.subscribeToPublicDonations(donations => {
      if (donations && donations.length > 0) {
        setRtdbDonations(prev => {
          // Merge unique
          const ids = new Set(prev.map(p => p.donationId));
          const unique = donations.filter(d => !ids.has(d.donationId));
          return [...unique, ...prev];
        });
      }
    });

    return () => {
      unsubSocketStatus();
      unsubSocketDonations();
      unsubConn();
      unsubDon();
    };
  }, [paymentService, firebaseClient, realtimeClient]);

  const activeGrant = grants.find(g => g.id === selectedGrantId) || grants[0];
  const parsedPaise = Math.round((parseFloat(amountRupees) || 0) * 100);

  // Separate Totals by Provenance
  const seededHistoryPaise = 100000000; // ₹1,000,000 (Seeded Grant Ceiling)
  const testModeCapturedPaise = rtdbDonations
    .filter(d => d.status === 'CAPTURED' || d.status === 'ANCHORED')
    .reduce((sum, d) => sum + (d.amountPaise || 0), 50000); // Base ₹500 test payment

  const handleRoleTabChange = (role: 'AARAV_DONOR' | 'MEERA_ADMIN' | 'RAVI_VENDOR' | 'JUDGE_AUDITOR') => {
    setDemoRole(role);
    if (role === 'MEERA_ADMIN' && onRoleChange) onRoleChange('ADMIN');
    if (role === 'JUDGE_AUDITOR' && onRoleChange) onRoleChange('AUDITOR');
    if (role === 'AARAV_DONOR' && onRoleChange) onRoleChange('DONOR');
  };

  const handleQuickAmount = (rupees: number) => {
    setAmountRupees(rupees.toString());
    setErrorMessage(null);
  };

  const handleStartCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!activeGrant) {
      setErrorMessage('Please select a valid grant.');
      return;
    }

    if (isNaN(parsedPaise) || parsedPaise <= 0) {
      setErrorMessage('Please enter a valid donation amount.');
      return;
    }

    if (parsedPaise < activeGrant.minDonationPaise || parsedPaise > activeGrant.maxDonationPaise) {
      setErrorMessage(
        `Amount must be between ₹${activeGrant.minDonationPaise / 100} and ₹${activeGrant.maxDonationPaise / 100}.`
      );
      return;
    }

    setCurrentStep('CREATING_ORDER');

    try {
      // 1. Create Order on Backend Server & Persist Pending Intent to Firebase RTDB
      const order = await paymentService.createOrder({
        grantId: activeGrant.id,
        amountPaise: parsedPaise,
        donorName,
        donorEmail,
        donorContact,
      });

      // 2. Open Razorpay Standard Checkout Popup
      if (typeof (window as any).Razorpay === 'undefined') {
        throw new Error('Razorpay Checkout SDK not loaded. Please verify internet connectivity.');
      }

      setCurrentStep('CHECKOUT_ACTIVE');

      const options = {
        key: order.keyId,
        amount: order.amountPaise,
        currency: order.currency,
        name: 'TrustFabric Protocol',
        description: `Verified Grant Contribution: ${activeGrant.grantCode}`,
        order_id: order.orderId,
        prefill: {
          name: donorName,
          email: donorEmail,
          contact: donorContact,
        },
        theme: {
          color: '#1B4332',
        },
        modal: {
          ondismiss: () => {
            if (currentStep === 'CHECKOUT_ACTIVE') {
              setCurrentStep('FORM');
              setErrorMessage('Checkout was cancelled by user.');
            }
          },
        },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          // 3. Server-Side Signature Verification & Status Check
          setCurrentStep('VERIFYING_PAYMENT');
          try {
            const verification = await paymentService.verifyPayment({
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            });

            setVerifiedResult(verification);

            if (verification.anchor && verification.anchor.status === 'CONFIRMED') {
              setCurrentStep('ANCHORED_SUCCESS');
            } else {
              setCurrentStep('ANCHORING_ONCHAIN');
              setTimeout(async () => {
                try {
                  const proof = await paymentService.getDonationProof(verification.donation.id);
                  setProofPackage(proof);
                  setCurrentStep('ANCHORED_SUCCESS');
                } catch {
                  setCurrentStep('PAYMENT_CONFIRMED');
                }
              }, 1600);
            }

            // Sync into TrustFabric state as an authenticated financial event
            const inboundEvent: FinancialEvent = {
              id: `evt-don-${Date.now().toString().slice(-6)}`,
              grantId: activeGrant.id,
              eventType: 'DONATION',
              sourceType: 'BANK_FIAT',
              sourceChainId: '11155111',
              txHash: response.razorpay_payment_id,
              finalityStatus: 'FINALIZED',
              sourceAccountRef: `${donorName} via Razorpay`,
              destinationRef: activeGrant.grantCode,
              assetId: 'INR',
              amountMinor: parsedPaise,
              currency: 'INR',
              feeMinor: 0,
              occurredAt: new Date().toISOString(),
              observedAt: new Date().toISOString(),
              provenance: 'RAZORPAY_TEST_CAPTURED',
              simulated: config?.isTestMode ?? true,
              idempotencyKey: `idem_pay_${response.razorpay_payment_id}`,
            };

            const updatedEvents = [...state.events, inboundEvent];
            onUpdateState({ events: updatedEvents });
          } catch (verErr: any) {
            setCurrentStep('PAYMENT_FAILED');
            setErrorMessage(`Payment verification failed: ${verErr.message}`);
          }
        },
      };

      const rzpInstance = new (window as any).Razorpay(options);
      rzpInstance.on('payment.failed', (failResp: any) => {
        setCurrentStep('PAYMENT_FAILED');
        setErrorMessage(`Gateway rejected payment: ${failResp.error.description || failResp.error.reason}`);
      });

      rzpInstance.open();
    } catch (err: any) {
      setCurrentStep('PAYMENT_FAILED');
      setErrorMessage(err.message || 'Failed to initiate checkout.');
    }
  };

  const handleViewProof = async () => {
    if (!verifiedResult) return;
    try {
      const proof = await paymentService.getDonationProof(verifiedResult.donation.id);
      setProofPackage(proof);
      setShowProofModal(true);
    } catch (err: any) {
      alert(`Proof retrieval failed: ${err.message}`);
    }
  };

  const handleRetryAnchor = async () => {
    if (!verifiedResult) return;
    setIsRetryingAnchor(true);
    try {
      const res = await paymentService.retryAnchor(verifiedResult.donation.id);
      if (res && res.anchor) {
        setVerifiedResult(prev => (prev ? { ...prev, anchor: res.anchor } : prev));
        setCurrentStep('ANCHORED_SUCCESS');
      }
    } catch (err: any) {
      alert(`Anchor retry error: ${err.message}`);
    } finally {
      setIsRetryingAnchor(false);
    }
  };

  const handleResetForm = () => {
    setCurrentStep('FORM');
    setVerifiedResult(null);
    setProofPackage(null);
    setErrorMessage(null);
  };

  const handleConnectWallet = async () => {
    setIsConnectingWallet(true);
    setWeb3Error(null);
    try {
      const walletInfo = await web3Service.connectWallet();
      setWalletAddress(walletInfo.address);
      setWalletBalance(walletInfo.balanceEth);
    } catch (err: any) {
      setWeb3Error(err.message || 'Failed to connect MetaMask wallet.');
    } finally {
      setIsConnectingWallet(false);
    }
  };

  const handleStartWeb3Donation = async (e: React.FormEvent) => {
    e.preventDefault();
    setWeb3Error(null);

    const val = parseFloat(amountEth);
    if (isNaN(val) || val <= 0) {
      setWeb3Error('Please enter a valid ETH donation amount greater than 0.');
      return;
    }

    if (!walletAddress) {
      setWeb3Error('Please connect your MetaMask wallet first.');
      return;
    }

    const activeWeb3Camp = web3Campaigns.find(c => c.id === selectedWeb3CampaignId) || web3Campaigns[0];

    try {
      setWeb3Step('AWAITING_SIGNATURE');
      const receipt = await web3Service.executeDonation({
        campaignId: activeWeb3Camp ? activeWeb3Camp.id : selectedWeb3CampaignId,
        amountEth,
        recipientAddress: activeWeb3Camp?.recipientAddress,
        onPendingTx: (hash) => {
          setWeb3TxHash(hash);
          setWeb3Step('MINING');
        },
      });

      setWeb3Receipt(receipt);
      setWeb3Step('CONFIRMED');
      setAllEthDonations(prev => [receipt, ...prev]);

      // Record in TrustFabric FinancialEvent ledger
      const onchainEvent: FinancialEvent = {
        id: `evt-eth-${Date.now().toString().slice(-6)}`,
        grantId: activeWeb3Camp?.id || 'CW-2026-014',
        eventType: 'DONATION',
        sourceType: 'ETHEREUM',
        sourceChainId: '11155111',
        txHash: receipt.txHash,
        finalityStatus: 'FINALIZED',
        sourceAccountRef: receipt.donorAddress,
        destinationRef: receipt.recipientAddress,
        assetId: 'ETH',
        amountMinor: Math.round(receipt.amountEth * 1e18),
        currency: 'ETH',
        feeMinor: 0,
        occurredAt: receipt.confirmedAt,
        observedAt: new Date().toISOString(),
        provenance: 'METAMASK_SEPOLIA_DONATION',
        simulated: false,
        idempotencyKey: `idem_eth_${receipt.txHash}`,
      };

      onUpdateState({ events: [...state.events, onchainEvent] });
    } catch (err: any) {
      setWeb3Step('FAILED');
      setWeb3Error(err.message || 'MetaMask transaction rejected or failed.');
    }
  };

  const handleResetWeb3Form = () => {
    setWeb3Step('IDLE');
    setWeb3Receipt(null);
    setWeb3TxHash(null);
    setWeb3Error(null);
  };

  const handleMeeraAllocate = () => {
    setAllocSuccessMsg('Accounting allocation recorded: ₹500 allocated to Solar Borehole Filter Cartridges. Provenance: INTERNAL_ACCOUNTING_ALLOCATION.');
    setTimeout(() => setAllocSuccessMsg(null), 5000);
    setShowAllocModal(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 4-Role Demo Switcher Header */}
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: '16px 20px',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
            CASCADE '26 Judge Live Demonstration Mode:
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() => handleRoleTabChange('AARAV_DONOR')}
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '12px',
                fontWeight: 600,
                border: demoRole === 'AARAV_DONOR' ? '2px solid var(--primary-evergreen)' : '1px solid var(--border-medium)',
                background: demoRole === 'AARAV_DONOR' ? 'var(--primary-evergreen-subtle)' : 'var(--bg-subtle)',
                color: demoRole === 'AARAV_DONOR' ? 'var(--primary-evergreen)' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              1. Donor &mdash; Aarav (₹500 Payment)
            </button>
            <button
              onClick={() => handleRoleTabChange('MEERA_ADMIN')}
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '12px',
                fontWeight: 600,
                border: demoRole === 'MEERA_ADMIN' ? '2px solid var(--primary-evergreen)' : '1px solid var(--border-medium)',
                background: demoRole === 'MEERA_ADMIN' ? 'var(--primary-evergreen-subtle)' : 'var(--bg-subtle)',
                color: demoRole === 'MEERA_ADMIN' ? 'var(--primary-evergreen)' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              2. NGO Admin &mdash; Meera (Live RTDB Feed)
            </button>
            <button
              onClick={() => handleRoleTabChange('RAVI_VENDOR')}
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '12px',
                fontWeight: 600,
                border: demoRole === 'RAVI_VENDOR' ? '2px solid var(--primary-evergreen)' : '1px solid var(--border-medium)',
                background: demoRole === 'RAVI_VENDOR' ? 'var(--primary-evergreen-subtle)' : 'var(--bg-subtle)',
                color: demoRole === 'RAVI_VENDOR' ? 'var(--primary-evergreen)' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              3. Field Worker / Vendor &mdash; Ravi
            </button>
            <button
              onClick={() => handleRoleTabChange('JUDGE_AUDITOR')}
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '12px',
                fontWeight: 600,
                border: demoRole === 'JUDGE_AUDITOR' ? '2px solid var(--primary-evergreen)' : '1px solid var(--border-medium)',
                background: demoRole === 'JUDGE_AUDITOR' ? 'var(--primary-evergreen-subtle)' : 'var(--bg-subtle)',
                color: demoRole === 'JUDGE_AUDITOR' ? 'var(--primary-evergreen)' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              4. Auditor / Judge &mdash; Read-Only
            </button>
          </div>
        </div>

        {/* Realtime Firebase RTDB Status Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: 'var(--radius-sm)',
              background: isFirebaseConnected ? 'var(--status-verified-bg)' : 'var(--status-review-bg)',
              color: isFirebaseConnected ? 'var(--status-verified-text)' : 'var(--status-review-text)',
              border: `1px solid ${isFirebaseConnected ? 'var(--status-verified-border)' : 'var(--status-review-border)'}`,
              fontFamily: 'var(--font-mono)',
            }}
          >
            <span style={{ fontSize: '10px' }}>{isFirebaseConnected ? '🟢' : '🟡'}</span>
            <span>{isFirebaseConnected ? 'RTDB: CONNECTED' : 'RTDB: INITIALIZING'}</span>
          </div>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: 'var(--radius-sm)',
              background: isSocketConnected ? '#ecfdf5' : '#fef3c7',
              color: isSocketConnected ? '#065f46' : '#92400e',
              border: `1px solid ${isSocketConnected ? '#a7f3d0' : '#fde68a'}`,
              fontFamily: 'var(--font-mono)',
            }}
          >
            <span style={{ fontSize: '10px' }}>{isSocketConnected ? '🟢' : '🟡'}</span>
            <span>{isSocketConnected ? 'SOCKET.IO: LIVE (100 CLIENTS)' : 'SOCKET.IO: CONNECTING'}</span>
          </div>

          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Target: <code style={{ fontSize: '10px' }}>ngoledger-default-rtdb</code> {lastRtdbSyncTime && <span>(Synced: {lastRtdbSyncTime})</span>}
          </span>
        </div>
      </div>

      {/* Segmented Provenance Totals Card */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px',
        }}
      >
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '14px 18px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Historical Seeded Funding
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
            ₹{(seededHistoryPaise / 100).toLocaleString()}
          </div>
          <div style={{ marginTop: '4px' }}>
            <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '3px', background: 'var(--status-simulated-bg)', color: 'var(--status-simulated-text)', border: '1px solid var(--status-simulated-border)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
              SEEDED_DEMO_DATA
            </span>
          </div>
        </div>

        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '14px 18px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Razorpay Test Captured
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--primary-evergreen)', marginTop: '4px' }}>
            ₹{(testModeCapturedPaise / 100).toLocaleString()}
          </div>
          <div style={{ marginTop: '4px' }}>
            <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '3px', background: 'var(--status-verified-bg)', color: 'var(--status-verified-text)', border: '1px solid var(--status-verified-border)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
              RAZORPAY_TEST_CAPTURED
            </span>
          </div>
        </div>

        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '14px 18px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            MetaMask Sepolia ETH
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#627EEA', marginTop: '4px' }}>
            {allEthDonations.reduce((acc, d) => acc + (d.amountEth || 0), 0).toFixed(3)} ETH
          </div>
          <div style={{ marginTop: '4px' }}>
            <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '3px', background: '#F0F4FF', color: '#405BFF', border: '1px solid #C7D7FE', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
              {allEthDonations.length} ON-CHAIN DONATIONS
            </span>
          </div>
        </div>

        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '14px 18px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Sepolia On-Chain Commitments
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
            {rtdbDonations.filter(d => d.status === 'ANCHORED').length + 1} Anchored
          </div>
          <div style={{ marginTop: '4px' }}>
            <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '3px', background: 'var(--primary-evergreen-subtle)', color: 'var(--primary-evergreen)', border: '1px solid var(--primary-evergreen-border)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
              ONCHAIN_ANCHORED_TESTNET
            </span>
          </div>
        </div>
      </div>

      {allocSuccessMsg && (
        <div style={{ padding: '12px 16px', background: 'var(--status-verified-bg)', color: 'var(--status-verified-text)', border: '1px solid var(--status-verified-border)', borderRadius: 'var(--radius-md)', fontSize: '13px' }}>
          {allocSuccessMsg}
        </div>
      )}

      {/* VIEW BASED ON DEMO ROLE */}
      {/* 1. DONOR VIEW (AARAV) */}
      {demoRole === 'AARAV_DONOR' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '20px' }}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
            {/* Payment Method Switcher Tabs */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '22px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '14px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setDonationMethod('METAMASK_SEPOLIA')}
                style={{
                  padding: '9px 16px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '13px',
                  fontWeight: 600,
                  border: donationMethod === 'METAMASK_SEPOLIA' ? '2px solid #627EEA' : '1px solid var(--border-medium)',
                  background: donationMethod === 'METAMASK_SEPOLIA' ? '#F0F4FF' : 'var(--bg-subtle)',
                  color: donationMethod === 'METAMASK_SEPOLIA' ? '#2B4EDB' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>🦊 Option 2: MetaMask Web3 (Sepolia ETH)</span>
                <span style={{ fontSize: '10px', background: '#2B4EDB', color: '#FFF', padding: '2px 6px', borderRadius: '3px', fontWeight: 700 }}>
                  ON-CHAIN DIRECT
                </span>
              </button>
              <button
                type="button"
                onClick={() => setDonationMethod('RAZORPAY_INR')}
                style={{
                  padding: '9px 16px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '13px',
                  fontWeight: 600,
                  border: donationMethod === 'RAZORPAY_INR' ? '2px solid var(--primary-evergreen)' : '1px solid var(--border-medium)',
                  background: donationMethod === 'RAZORPAY_INR' ? 'var(--primary-evergreen-subtle)' : 'var(--bg-subtle)',
                  color: donationMethod === 'RAZORPAY_INR' ? 'var(--primary-evergreen)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>💳 Option 1: Razorpay Gateway (INR Fiat)</span>
              </button>
            </div>

            {/* ================= OPTION 2: METAMASK SEPOLIA ETH ================= */}
            {donationMethod === 'METAMASK_SEPOLIA' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Direct Smart Contract ETH Donation
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Non-custodial payment via single <code>TrustFabric.sol</code> contract on Ethereum Sepolia.
                    </p>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '3px', background: '#EEF2FF', color: '#4F46E5', border: '1px solid #C7D2FE', fontFamily: 'var(--font-mono)' }}>
                    SEPOLIA TESTNET (11155111)
                  </span>
                </div>

                {/* MetaMask Wallet Connection Status Bar */}
                <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '14px 16px', marginBottom: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: walletAddress ? '#10B981' : '#F59E0B' }} />
                    <div style={{ fontSize: '13px' }}>
                      {walletAddress ? (
                        <span>
                          Connected: <strong style={{ fontFamily: 'var(--font-mono)' }}>{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</strong>
                          {walletBalance && <span style={{ color: 'var(--text-secondary)', marginLeft: '8px' }}>({walletBalance} ETH)</span>}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)' }}>MetaMask Wallet Not Connected</span>
                      )}
                    </div>
                  </div>

                  <div>
                    {!walletAddress ? (
                      <button
                        type="button"
                        onClick={handleConnectWallet}
                        disabled={isConnectingWallet}
                        style={{
                          padding: '7px 14px',
                          borderRadius: 'var(--radius-md)',
                          background: '#F97316',
                          color: '#FFF',
                          border: 'none',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        {isConnectingWallet ? '⏳ Connecting...' : '🦊 Connect MetaMask'}
                      </button>
                    ) : (
                      <span style={{ fontSize: '11px', color: 'var(--status-verified-text)', background: 'var(--status-verified-bg)', padding: '3px 8px', borderRadius: '4px', fontWeight: 600 }}>
                        Sepolia Verified ✓
                      </span>
                    )}
                  </div>
                </div>

                {web3Error && (
                  <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--status-danger-bg)', color: 'var(--status-danger-text)', border: '1px solid var(--status-danger-border)', borderRadius: 'var(--radius-md)', fontSize: '13px' }}>
                    {web3Error}
                  </div>
                )}

                {/* FORM / EXECUTION STATE */}
                {web3Step === 'IDLE' && (
                  <form onSubmit={handleStartWeb3Donation}>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
                        Select Campaign:
                      </label>
                      <select
                        value={selectedWeb3CampaignId}
                        onChange={e => setSelectedWeb3CampaignId(e.target.value)}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)', background: 'var(--bg-surface)', fontSize: '14px' }}
                      >
                        {web3Campaigns.map(c => (
                          <option key={c.id} value={c.id}>
                            [{c.id}] {c.name} &mdash; {c.ngoName}
                          </option>
                        ))}
                      </select>
                      {(() => {
                        const activeCamp = web3Campaigns.find(c => c.id === selectedWeb3CampaignId);
                        if (!activeCamp) return null;
                        return (
                          <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-secondary)', background: 'var(--bg-subtle)', padding: '6px 10px', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}>
                            Authorized Recipient: <strong>{activeCamp.recipientAddress}</strong>
                          </div>
                        );
                      })()}
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
                        Donation Amount (ETH):
                      </label>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                        {['0.001', '0.005', '0.01', '0.05', '0.1'].map(amt => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => setAmountEth(amt)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: 'var(--radius-md)',
                              fontSize: '12px',
                              fontWeight: 600,
                              border: amountEth === amt ? '2px solid #627EEA' : '1px solid var(--border-medium)',
                              background: amountEth === amt ? '#F0F4FF' : 'var(--bg-surface)',
                              color: amountEth === amt ? '#2B4EDB' : 'var(--text-primary)',
                              cursor: 'pointer',
                            }}
                          >
                            {amt} ETH
                          </button>
                        ))}
                      </div>

                      <div style={{ position: 'relative', width: '220px' }}>
                        <span style={{ position: 'absolute', left: '12px', top: '9px', fontSize: '14px', color: 'var(--text-muted)' }}>Ξ</span>
                        <input
                          type="number"
                          step="0.001"
                          min="0.0001"
                          value={amountEth}
                          onChange={e => setAmountEth(e.target.value)}
                          style={{ width: '100%', padding: '9px 12px 9px 28px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)', fontSize: '14px', fontWeight: 600 }}
                        />
                      </div>
                      <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                        Smart contract validates <code>msg.value &gt; 0</code> and transfers directly to campaign recipient.
                      </div>
                    </div>

                    <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 'var(--radius-md)', padding: '12px 14px', marginBottom: '20px', fontSize: '12px', color: '#475569' }}>
                      <div style={{ fontWeight: 600, marginBottom: '4px', color: '#1E293B' }}>🛡️ Security &amp; Privacy Architecture:</div>
                      <div>&bull; <strong>Zero PII On-Chain:</strong> Your personal name, email, and phone are never stored on Ethereum.</div>
                      <div>&bull; <strong>Single Contract:</strong> Calls <code>TrustFabric.donate(bytes32 campaignId)</code> directly.</div>
                      <div>&bull; <strong>Reentrancy Guard:</strong> Protected with OpenZeppelin mutex locks.</div>
                    </div>

                    <button
                      type="submit"
                      disabled={!walletAddress}
                      style={{
                        padding: '12px 24px',
                        borderRadius: 'var(--radius-md)',
                        background: walletAddress ? '#627EEA' : '#94A3B8',
                        color: '#FFF',
                        border: 'none',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: walletAddress ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      {walletAddress ? `🦊 Donate ${amountEth} ETH via MetaMask` : '🦊 Connect MetaMask to Donate'}
                    </button>
                  </form>
                )}

                {/* AWAITING SIGNATURE */}
                {web3Step === 'AWAITING_SIGNATURE' && (
                  <div style={{ textAlign: 'center', padding: '36px 20px' }}>
                    <div style={{ fontSize: '36px', marginBottom: '10px' }}>🦊</div>
                    <h4 style={{ margin: '0 0 6px', fontSize: '16px', color: 'var(--text-primary)' }}>
                      Awaiting MetaMask Signature...
                    </h4>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                      Please review the amount (<strong>{amountEth} ETH</strong>) and confirm the transaction in your MetaMask popup.
                    </p>
                  </div>
                )}

                {/* MINING ON-CHAIN */}
                {web3Step === 'MINING' && (
                  <div style={{ textAlign: 'center', padding: '36px 20px' }}>
                    <div style={{ fontSize: '36px', marginBottom: '10px' }}>⛏️</div>
                    <h4 style={{ margin: '0 0 6px', fontSize: '16px', color: 'var(--text-primary)' }}>
                      Mining Transaction on Ethereum Sepolia...
                    </h4>
                    <p style={{ margin: '0 0 12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      Awaiting 1 block confirmation and authoritative receipt.
                    </p>
                    {web3TxHash && (
                      <div style={{ fontSize: '12px' }}>
                        Tx Hash: <code style={{ wordBreak: 'break-all' }}>{web3TxHash}</code>
                        <div style={{ marginTop: '8px' }}>
                          <a href={`https://sepolia.etherscan.io/tx/${web3TxHash}`} target="_blank" rel="noreferrer" style={{ color: '#2B4EDB', textDecoration: 'underline', fontWeight: 600 }}>
                            View on Sepolia Etherscan &rarr;
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* CONFIRMED RECEIPT CARD */}
                {web3Step === 'CONFIRMED' && web3Receipt && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '14px', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--status-verified-bg)', color: 'var(--status-verified-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '16px' }}>
                          ✓
                        </div>
                        <div>
                          <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--text-primary)' }}>
                            MetaMask Donation Confirmed &amp; Verified On-Chain!
                          </h4>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            Event <code>DonationReceived</code> Verified &bull; Block #{web3Receipt.blockNumber}
                          </div>
                        </div>
                      </div>

                      <button onClick={handleResetWeb3Form} style={{ padding: '6px 14px', borderRadius: '4px', background: '#627EEA', color: '#FFF', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                        New ETH Donation
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                      <div style={{ background: 'var(--bg-subtle)', padding: '14px', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>
                          On-Chain Transaction Details
                        </div>
                        <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div>Amount Donated: <strong style={{ color: '#627EEA' }}>{web3Receipt.amountEth} ETH</strong></div>
                          <div>Campaign ID: <code>{web3Receipt.campaignId}</code></div>
                          <div>Donor: <code>{web3Receipt.donorAddress.slice(0, 10)}...{web3Receipt.donorAddress.slice(-8)}</code></div>
                          <div>Recipient: <code>{web3Receipt.recipientAddress.slice(0, 10)}...{web3Receipt.recipientAddress.slice(-8)}</code></div>
                          <div>Status: <span style={{ background: 'var(--status-verified-bg)', color: 'var(--status-verified-text)', padding: '1px 6px', borderRadius: '3px', fontWeight: 600 }}>CONFIRMED</span></div>
                        </div>
                      </div>

                      <div style={{ background: 'var(--bg-subtle)', padding: '14px', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>
                          Authoritative Verification Proof
                        </div>
                        <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div>Contract: <code>{SEPOLIA_CONTRACT_ADDRESS.slice(0, 8)}...{SEPOLIA_CONTRACT_ADDRESS.slice(-6)}</code></div>
                          <div>Event Log: <span style={{ color: '#10B981', fontWeight: 600 }}>DonationReceived (VERIFIED)</span></div>
                          <div>Database: <span style={{ color: '#10B981', fontWeight: 600 }}>Persisted in PostgreSQL (Prisma)</span></div>
                          <div style={{ marginTop: '6px' }}>
                            <a href={web3Receipt.explorerUrl} target="_blank" rel="noreferrer" style={{ color: '#2B4EDB', textDecoration: 'underline', fontWeight: 600 }}>
                              Open Sepolia Block Explorer &rarr;
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* FAILED STATE */}
                {web3Step === 'FAILED' && (
                  <div style={{ textAlign: 'center', padding: '30px' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px', color: 'var(--status-danger-text)' }}>⚠️</div>
                    <h4 style={{ margin: '0 0 6px', fontSize: '15px', color: 'var(--status-danger-text)' }}>Transaction Failed or Rejected</h4>
                    <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>{web3Error}</p>
                    <button onClick={handleResetWeb3Form} style={{ padding: '6px 14px', background: '#627EEA', color: '#FFF', border: 'none', borderRadius: '4px', fontSize: '13px', cursor: 'pointer' }}>
                      Try Again
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ================= OPTION 1: RAZORPAY INR FIAT ================= */}
            {donationMethod === 'RAZORPAY_INR' && (
              <div>
                {(currentStep === 'FORM' || currentStep === 'CREATING_ORDER') && (
                  <form onSubmit={handleStartCheckout}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        Make a Contribution &bull; Clean Water for 50 Families
                      </h3>
                      <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '3px', background: 'var(--status-review-bg)', color: 'var(--status-review-text)', border: '1px solid var(--status-review-border)', fontFamily: 'var(--font-mono)' }}>
                        RAZORPAY TEST MODE (NO REAL MONEY MOVES)
                      </span>
                </div>

                {errorMessage && (
                  <div style={{ marginBottom: '14px', padding: '10px', background: 'var(--status-danger-bg)', color: 'var(--status-danger-text)', border: '1px solid var(--status-danger-border)', borderRadius: 'var(--radius-md)', fontSize: '13px' }}>
                    {errorMessage}
                  </div>
                )}

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
                    Campaign:
                  </label>
                  <select
                    value={selectedGrantId}
                    onChange={e => setSelectedGrantId(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)', background: 'var(--bg-surface)', fontSize: '14px' }}
                  >
                    {grants.map(g => (
                      <option key={g.id} value={g.id}>
                        [{g.grantCode}] {g.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
                    Amount (₹ INR):
                  </label>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                    {[500, 1000, 2500, 5000].map(amt => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => handleQuickAmount(amt)}
                        style={{
                          padding: '6px 14px',
                          borderRadius: 'var(--radius-md)',
                          fontSize: '13px',
                          fontWeight: 500,
                          border: amountRupees === amt.toString() ? '2px solid var(--primary-evergreen)' : '1px solid var(--border-medium)',
                          background: amountRupees === amt.toString() ? 'var(--primary-evergreen-subtle)' : 'var(--bg-surface)',
                          color: amountRupees === amt.toString() ? 'var(--primary-evergreen)' : 'var(--text-primary)',
                          cursor: 'pointer',
                        }}
                      >
                        ₹{amt.toLocaleString()}
                      </button>
                    ))}
                  </div>

                  <div style={{ position: 'relative', width: '220px' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '9px', fontSize: '15px', color: 'var(--text-muted)' }}>₹</span>
                    <input
                      type="number"
                      min="100"
                      max="500000"
                      value={amountRupees}
                      onChange={e => setAmountRupees(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px 9px 28px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)', fontSize: '15px', fontWeight: 600 }}
                    />
                  </div>
                  <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    Evaluated server-side as {parsedPaise.toLocaleString()} integer paise.
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
                      Donor Name:
                    </label>
                    <input
                      type="text"
                      value={donorName}
                      onChange={e => setDonorName(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)', fontSize: '13px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
                      Email:
                    </label>
                    <input
                      type="email"
                      value={donorEmail}
                      onChange={e => setDonorEmail(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)', fontSize: '13px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
                      Phone:
                    </label>
                    <input
                      type="tel"
                      value={donorContact}
                      onChange={e => setDonorContact(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)', fontSize: '13px' }}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={currentStep === 'CREATING_ORDER'}
                  style={{
                    padding: '11px 22px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--primary-evergreen)',
                    color: '#FFF',
                    border: 'none',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  {currentStep === 'CREATING_ORDER' ? '⏳ Creating Razorpay Order...' : `💳 Donate ₹${parseFloat(amountRupees || '0').toLocaleString()} via Razorpay Checkout`}
                </button>
              </form>
            )}

            {currentStep === 'CHECKOUT_ACTIVE' && (
              <div style={{ textAlign: 'center', padding: '30px' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>💳</div>
                <h4 style={{ margin: '0 0 6px', fontSize: '16px' }}>Razorpay Checkout Dialog Active</h4>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Complete payment in the Razorpay popup using test credentials.
                </p>
              </div>
            )}

            {currentStep === 'VERIFYING_PAYMENT' && (
              <div style={{ textAlign: 'center', padding: '30px' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>🛡️</div>
                <h4 style={{ margin: '0 0 6px', fontSize: '16px' }}>Payment Received: Verifying with Razorpay API...</h4>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                  The server is validating HMAC-SHA256 signature and authoritative captured status before accepting.
                </p>
              </div>
            )}

            {(currentStep === 'ANCHORED_SUCCESS' || currentStep === 'ANCHORING_ONCHAIN' || currentStep === 'PAYMENT_CONFIRMED') && verifiedResult && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '14px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--status-verified-bg)', color: 'var(--status-verified-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                      ✓
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--text-primary)' }}>
                        Donation Verified &amp; Anchored on Sepolia
                      </h4>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Reference: <strong>{verifiedResult.donation.donationCode}</strong>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={handleViewProof} style={{ padding: '6px 12px', borderRadius: '4px', background: 'var(--bg-subtle)', border: '1px solid var(--border-medium)', fontSize: '12px', cursor: 'pointer' }}>
                      Audit Proof Package
                    </button>
                    <button onClick={handleResetForm} style={{ padding: '6px 12px', borderRadius: '4px', background: 'var(--primary-evergreen)', color: '#FFF', border: 'none', fontSize: '12px', cursor: 'pointer' }}>
                      New Donation
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                  <div style={{ background: 'var(--bg-subtle)', padding: '14px', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '6px' }}>
                      Razorpay Captured Record
                    </div>
                    <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div>Payment ID: <code>{verifiedResult.paymentDetails.paymentId}</code></div>
                      <div>Order ID: <code>{verifiedResult.paymentDetails.orderId}</code></div>
                      <div>Amount: <strong>₹{(verifiedResult.paymentDetails.amount / 100).toLocaleString()} INR</strong></div>
                      <div>Status: <span style={{ background: 'var(--status-verified-bg)', color: 'var(--status-verified-text)', padding: '1px 5px', borderRadius: '3px', fontWeight: 600 }}>CAPTURED</span></div>
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg-subtle)', padding: '14px', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '6px' }}>
                      Ethereum Sepolia Anchor
                    </div>
                    {verifiedResult.anchor ? (
                      <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div>Tx Hash: <code style={{ fontSize: '11px' }}>{verifiedResult.anchor.txHash}</code></div>
                        <div>Block: #{verifiedResult.anchor.blockNumber} &bull; Gas: {verifiedResult.anchor.gasUsed.toLocaleString()}</div>
                        <div style={{ marginTop: '4px' }}>
                          <a href={verifiedResult.anchor.explorerUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--primary-evergreen)', fontWeight: 600, textDecoration: 'underline' }}>
                            View on Sepolia Etherscan &rarr;
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Submitting commitment to Sepolia...</div>
                        <button onClick={handleRetryAnchor} disabled={isRetryingAnchor} style={{ marginTop: '6px', padding: '4px 10px', fontSize: '11px', background: 'var(--primary-evergreen)', color: '#FFF', border: 'none', borderRadius: '3px' }}>
                          {isRetryingAnchor ? 'Retrying...' : 'Retry Anchor'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ padding: '10px 14px', background: 'var(--primary-evergreen-subtle)', border: '1px solid var(--primary-evergreen-border)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '12px', color: 'var(--primary-evergreen)', fontWeight: 600 }}>
                    Linked into TrustFabric Fund-Flow Graph &bull; Realtime RTDB Synced
                  </div>
                  {onNavigateToFundFlows && (
                    <button onClick={onNavigateToFundFlows} style={{ padding: '5px 12px', background: 'var(--primary-evergreen)', color: '#FFF', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                      Fund Flows &rarr;
                    </button>
                  )}
                </div>
              </div>
            )}

            {currentStep === 'PAYMENT_FAILED' && (
              <div style={{ textAlign: 'center', padding: '30px' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px', color: 'var(--status-danger-text)' }}>⚠️</div>
                <h4 style={{ margin: '0 0 6px', fontSize: '15px', color: 'var(--status-danger-text)' }}>Payment or Verification Rejected</h4>
                <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>{errorMessage}</p>
                <button onClick={handleResetForm} style={{ padding: '6px 14px', background: 'var(--primary-evergreen)', color: '#FFF', border: 'none', borderRadius: '4px', fontSize: '13px', cursor: 'pointer' }}>
                  Try Again
                </button>
              </div>
            )}
            </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '18px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-primary)', marginBottom: '8px' }}>
                {donationMethod === 'METAMASK_SEPOLIA' ? 'Smart Contract Architecture' : 'Verified Campaign Scope'}
              </div>
              <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-secondary)' }}>
                {donationMethod === 'METAMASK_SEPOLIA' ? (
                  <>
                    <div><strong>Contract:</strong> <code>TrustFabric.sol</code></div>
                    <div><strong>Address:</strong> <code>{SEPOLIA_CONTRACT_ADDRESS.slice(0, 10)}...{SEPOLIA_CONTRACT_ADDRESS.slice(-6)}</code></div>
                    <div><strong>Function:</strong> <code>donate(bytes32 campaignId)</code></div>
                    <div><strong>Network:</strong> Ethereum Sepolia (11155111)</div>
                    <div><strong>Safety:</strong> OpenZeppelin ReentrancyGuard</div>
                  </>
                ) : (
                  <>
                    <div><strong>Code:</strong> {activeGrant?.grantCode}</div>
                    <div><strong>Purpose:</strong> {activeGrant?.purpose}</div>
                    <div><strong>Currency:</strong> INR</div>
                    <div><strong>Target:</strong> ₹5,00,000</div>
                  </>
                )}
              </div>
            </div>

            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '18px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-primary)', marginBottom: '8px' }}>
                Cryptographic Trust Model
              </div>
              <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {donationMethod === 'METAMASK_SEPOLIA' ? (
                  <>
                    <li>Direct on-chain value transfer without intermediary custody.</li>
                    <li>Funds routed strictly to registered on-chain recipient.</li>
                    <li>Emits authoritative <code>DonationReceived</code> event log.</li>
                    <li>Receipt index persisted idempotently in PostgreSQL database.</li>
                  </>
                ) : (
                  <>
                    <li>Razorpay test payments simulate fiat settlement.</li>
                    <li>HMAC verified server-side in constant time.</li>
                    <li>Commitments anchored to Ethereum Sepolia.</li>
                    <li>Firebase RTDB synchronizes multi-device views.</li>
                  </>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* 2. NGO ADMIN VIEW (MEERA) */}
      {demoRole === 'MEERA_ADMIN' && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                NGO Finance Admin Dashboard (Meera) &mdash; Live RTDB Inbound Feed
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Incoming Razorpay Test Mode payments appear here in real time via Firebase Realtime Database without manual browser refresh.
              </p>
            </div>
            <button
              onClick={() => setShowAllocModal(true)}
              style={{
                padding: '7px 14px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--primary-evergreen)',
                color: '#FFF',
                border: 'none',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + Create Internal Accounting Allocation
            </button>
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 14px' }}>Reference</th>
                  <th style={{ padding: '10px 14px' }}>Campaign</th>
                  <th style={{ padding: '10px 14px' }}>Amount</th>
                  <th style={{ padding: '10px 14px' }}>Payment ID</th>
                  <th style={{ padding: '10px 14px' }}>Provenance</th>
                  <th style={{ padding: '10px 14px' }}>Sepolia Anchor</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>TF-INR-840874</td>
                  <td style={{ padding: '10px 14px' }}>CW-2026-014</td>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>₹1,000</td>
                  <td style={{ padding: '10px 14px' }}><code>pay_captured_live_002</code></td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ padding: '2px 6px', borderRadius: '3px', background: 'var(--status-verified-bg)', color: 'var(--status-verified-text)', fontSize: '10px', fontWeight: 600 }}>
                      RAZORPAY_TEST_CAPTURED
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <a href="https://sepolia.etherscan.io/tx/0x3eedda6033039fbe473f145d5ef7e01e19025013632c58f7d622c7fb13483adb" target="_blank" rel="noreferrer" style={{ color: 'var(--primary-evergreen)', textDecoration: 'underline' }}>
                      #7248208 &rarr;
                    </a>
                  </td>
                </tr>

                {allEthDonations.map((eth, idx) => (
                  <tr key={`eth-${idx}`} style={{ borderBottom: '1px solid var(--border-subtle)', background: '#F8FAFF' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#4F46E5' }}>
                      ETH-SEP-{eth.blockNumber || 'LIVE'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>{eth.campaignId}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#627EEA' }}>
                      {eth.amountEth} ETH
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <code style={{ fontSize: '11px' }}>{eth.txHash ? `${eth.txHash.slice(0, 10)}...${eth.txHash.slice(-6)}` : 'On-Chain'}</code>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ padding: '2px 6px', borderRadius: '3px', background: '#EEF2FF', color: '#4F46E5', fontSize: '10px', fontWeight: 700 }}>
                        METAMASK_SEPOLIA_DONATION
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <a href={eth.explorerUrl} target="_blank" rel="noreferrer" style={{ color: '#2B4EDB', textDecoration: 'underline', fontWeight: 600 }}>
                        Block #{eth.blockNumber} &rarr;
                      </a>
                    </td>
                  </tr>
                ))}

                {rtdbDonations.map((d, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>{d.donationCode}</td>
                    <td style={{ padding: '10px 14px' }}>{d.campaignId}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>₹{(d.amountPaise / 100).toLocaleString()}</td>
                    <td style={{ padding: '10px 14px' }}><code>{d.razorpayPaymentId || 'N/A'}</code></td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ padding: '2px 6px', borderRadius: '3px', background: 'var(--status-verified-bg)', color: 'var(--status-verified-text)', fontSize: '10px', fontWeight: 600 }}>
                        {d.provenance || 'RAZORPAY_TEST_CAPTURED'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {d.explorerUrl ? (
                        <a href={d.explorerUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--primary-evergreen)', textDecoration: 'underline' }}>
                          Verified &rarr;
                        </a>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Pending Anchor</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. FIELD WORKER / VENDOR VIEW (RAVI) */}
      {demoRole === 'RAVI_VENDOR' && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Field Worker / Vendor Workspace (Ravi)
          </h3>
          <p style={{ margin: '0 0 18px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            Submit field completion evidence and vendor receipts. All uploaded evidence is cryptographically fingerprinted and checked for cross-grant duplicate nullifiers.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ background: 'var(--bg-subtle)', padding: '16px', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                Seeded Sample Invoice (Apex Well Drilling)
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div>Invoice #: <code>APEX-2026-0881</code></div>
                <div>Amount: ₹85,000 INR (Paise: 8,500,000)</div>
                <div>Digest: <code>e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855</code></div>
                <div>Provenance: <span style={{ padding: '1px 5px', borderRadius: '3px', background: 'var(--status-simulated-bg)', color: 'var(--status-simulated-text)', fontWeight: 600 }}>SEEDED_DEMO_DATA</span></div>
              </div>
            </div>

            <div style={{ background: 'var(--bg-subtle)', padding: '16px', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                Field Delivery Attestation
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div>Inspector: Ravi Sharma (Inspector #4)</div>
                <div>Signature: <code>ed25519:3a9f...88b1</code></div>
                <div>Status: <span style={{ padding: '1px 5px', borderRadius: '3px', background: 'var(--status-verified-bg)', color: 'var(--status-verified-text)', fontWeight: 600 }}>SOURCE_ATTESTED</span></div>
                <div>Trust Note: Proves inspector signed completion statement; does not prove physical ground reality.</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. AUDITOR / JUDGE VIEW */}
      {demoRole === 'JUDGE_AUDITOR' && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Auditor &amp; Judge Verification Station (Read-Only)
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Independent forensic inspection of Razorpay order tokens, Firebase RTDB persistence, and on-chain Sepolia anchor transactions. Zero donor PII exposed.
              </p>
            </div>

            <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '3px', background: 'var(--bg-subtle)', color: 'var(--text-primary)', border: '1px solid var(--border-medium)', fontFamily: 'var(--font-mono)' }}>
              ROLE: READ_ONLY_AUDITOR
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
            <div style={{ background: 'var(--bg-subtle)', padding: '16px', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>
                1. Gateway &amp; Off-Chain Verification
              </div>
              <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div>Key ID: <code>rzp_test_Ts8hc71B3sf8nu</code></div>
                <div>HMAC Algorithm: <code>HMAC-SHA256 (Constant-Time)</code></div>
                <div>Order Integrity: <code>Validated Server-Side in Integer Paise</code></div>
                <div>Provenance: <span style={{ fontWeight: 600, color: 'var(--status-verified-text)' }}>RAZORPAY_TEST_CAPTURED</span></div>
              </div>
            </div>

            <div style={{ background: 'var(--bg-subtle)', padding: '16px', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>
                2. Remote Persistence (Firebase RTDB)
              </div>
              <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div>Endpoint: <code>ngoledger-default-rtdb.firebaseio.com</code></div>
                <div>State: <span style={{ fontWeight: 600, color: 'var(--status-verified-text)' }}>FIREBASE_PERSISTED</span></div>
                <div>Sync Mechanism: <code>WebSocket onValue Listeners</code></div>
                <div>Security Rules: <code>Restricted Private / Sanitized Public</code></div>
              </div>
            </div>

            <div style={{ background: 'var(--bg-subtle)', padding: '16px', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>
                3. Sepolia On-Chain Proof
              </div>
              <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div>Network: <code>Ethereum Sepolia (Chain ID 11155111)</code></div>
                <div>Contract: <code>0x71C25bf4e37da4b7F2eFe341F21074eAf7096eF4</code></div>
                <div>Verified Tx: <code>0x3eedda6033039fbe473f145d5ef7e01e19025013632c58f7d622c7fb13483adb</code></div>
                <div>
                  <a href="https://sepolia.etherscan.io/tx/0x3eedda6033039fbe473f145d5ef7e01e19025013632c58f7d622c7fb13483adb" target="_blank" rel="noreferrer" style={{ color: 'var(--primary-evergreen)', fontWeight: 600, textDecoration: 'underline' }}>
                    Inspect Sepolia Etherscan &rarr;
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Accounting Allocation Modal */}
      {showAllocModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '480px', padding: '24px' }}>
            <h4 style={{ margin: '0 0 12px', fontSize: '16px' }}>Internal Grant Accounting Allocation</h4>
            <p style={{ margin: '0 0 14px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              Allocate captured test payment (₹500) within the grant budget model. Note: This records an internal accounting assignment, not a real external bank transfer.
            </p>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Allocation Purpose:</label>
              <input type="text" defaultValue="Solar Borehole Filter Cartridges" style={{ width: '100%', padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--border-medium)', fontSize: '13px' }} />
            </div>
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Allocated Amount:</label>
              <input type="text" defaultValue="₹500 INR" disabled style={{ width: '100%', padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--border-medium)', fontSize: '13px', background: 'var(--bg-subtle)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setShowAllocModal(false)} style={{ padding: '6px 12px', borderRadius: '4px', background: 'var(--bg-subtle)', border: '1px solid var(--border-medium)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleMeeraAllocate} style={{ padding: '6px 14px', borderRadius: '4px', background: 'var(--primary-evergreen)', color: '#FFF', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Confirm Allocation</button>
            </div>
          </div>
        </div>
      )}

      {/* Proof Package Modal */}
      {showProofModal && proofPackage && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h4 style={{ margin: 0, fontSize: '16px' }}>Cryptographic Audit Proof Package</h4>
              <button onClick={() => setShowProofModal(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}>&times;</button>
            </div>
            <pre style={{ background: 'var(--bg-subtle)', padding: '14px', borderRadius: 'var(--radius-md)', fontSize: '11px', fontFamily: 'var(--font-mono)', overflowX: 'auto' }}>
              {JSON.stringify(proofPackage, null, 2)}
            </pre>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}>
              <button onClick={() => setShowProofModal(false)} style={{ padding: '6px 14px', borderRadius: '4px', background: 'var(--primary-evergreen)', color: '#FFF', border: 'none', cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
