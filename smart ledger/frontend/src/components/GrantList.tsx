import React, { useState } from 'react';
import { type Grant } from '../types/trustfabric';
import { type TrustFabricStoreState } from '../services/storage';
import { GrantPolicyService } from '../services/grantPolicy';

interface GrantListProps {
  state: TrustFabricStoreState;
  onUpdateState: (updated: Partial<TrustFabricStoreState>) => void;
  onSelectGrant: (grantId: string) => void;
  onNavigateToDonate?: (grantId: string) => void;
}

export const GrantList: React.FC<GrantListProps> = ({
  state,
  onUpdateState,
  onSelectGrant,
  onNavigateToDonate,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedGrant, setSelectedGrant] = useState<Grant | null>(null);

  // New Grant Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGrantCode, setNewGrantCode] = useState('');
  const [newPurpose, setNewPurpose] = useState('');
  const [newDonorId, setNewDonorId] = useState('donor-northstar');
  const [newCapRupees, setNewCapRupees] = useState('500000');
  const [newCategories, setNewCategories] = useState('Water Infrastructure, Emergency Relief');
  const [formError, setFormError] = useState<string | null>(null);

  // Add Allocation Modal State
  const [showAllocModal, setShowAllocModal] = useState(false);
  const [allocCategory, setAllocCategory] = useState('');
  const [allocAmountRupees, setAllocAmountRupees] = useState('50000');
  const [allocMilestoneId, setAllocMilestoneId] = useState('');
  const [allocError, setAllocError] = useState<string | null>(null);

  const filteredGrants = state.grants.filter(g => {
    const matchesSearch =
      g.grantCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      g.purpose.toLowerCase().includes(searchTerm.toLowerCase()) ||
      g.donorId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || g.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreateGrant = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const capMinor = Math.round(parseFloat(newCapRupees) * 100);
    if (!newGrantCode.trim()) {
      setFormError('Grant code is required (e.g. CW-2026-020).');
      return;
    }
    if (isNaN(capMinor) || capMinor <= 0) {
      setFormError('Authorized budget must be a positive number.');
      return;
    }

    const categoriesArray = newCategories
      .split(',')
      .map(c => c.trim())
      .filter(c => c.length > 0);

    if (categoriesArray.length === 0) {
      setFormError('At least one authorized expenditure category is required.');
      return;
    }

    const newGrant: Grant = {
      id: `grant-${newGrantCode.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`,
      grantCode: newGrantCode.trim().toUpperCase(),
      donorId: newDonorId,
      organizationId: 'org-cascade-aid',
      purpose: newPurpose.trim() || 'General Humanitarian Relief Project',
      currency: 'INR',
      authorizedAmountMinor: capMinor,
      allowedCategories: categoriesArray,
      milestones: [
        {
          id: `MS-1-${Date.now()}`,
          title: 'Phase 1: Project Mobilization & Initial Procurement',
          description: 'Procure primary supplies and deploy field engineers.',
          targetDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
          amountMinor: Math.round(capMinor * 0.5),
          conditionType: 'DELIVERY_ATTESTATION',
          isMet: false,
        },
      ],
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      allocatedMinor: 0,
      spentMinor: 0,
      unreconciledMinor: 0,
      heldMinor: 0,
      remainingMinor: capMinor,
    };

    const updatedGrants = [...state.grants, newGrant];
    onUpdateState({ grants: updatedGrants });
    setShowCreateModal(false);
    setNewGrantCode('');
    setNewPurpose('');
  };

  const handleOpenAddAllocation = (grant: Grant) => {
    setSelectedGrant(grant);
    setAllocCategory(grant.allowedCategories[0] || '');
    setAllocMilestoneId(grant.milestones[0]?.id || '');
    setAllocError(null);
    setShowAllocModal(true);
  };

  const handleAddAllocation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGrant) return;
    setAllocError(null);

    const amountMinor = Math.round(parseFloat(allocAmountRupees) * 100);
    const result = GrantPolicyService.validateAndAddAllocation(
      selectedGrant,
      state.allocations,
      {
        category: allocCategory,
        amountMinor,
        currency: 'INR',
        milestoneId: allocMilestoneId,
      }
    );

    if (!result.success || !result.allocation) {
      setAllocError(result.error || 'Failed to validate allocation.');
      return;
    }

    const updatedAllocations = [...state.allocations, result.allocation];
    // Recalculate grant financials
    const updatedGrants = state.grants.map(g => {
      if (g.id === selectedGrant.id) {
        const stats = GrantPolicyService.calculateGrantFinancials(
          g,
          updatedAllocations,
          state.claims,
          state.escrowCases
        );
        return { ...g, ...stats };
      }
      return g;
    });

    onUpdateState({
      allocations: updatedAllocations,
      grants: updatedGrants,
    });

    setShowAllocModal(false);
  };

  return (
    <div className="content-container">
      {/* Header with Search and Action */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Grants & Purpose-Bound Allocations
          </h2>
          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            Earmarked donor funds with cryptographically enforced spending categories (PS42-R03)
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Search code, donor, purpose..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ width: '240px' }}
          />

          <select
            className="form-select"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ width: '130px' }}
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="COMPLETED">Completed</option>
            <option value="HALTED">Halted</option>
          </select>

          <button
            className="btn btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            + New Grant
          </button>
        </div>
      </div>

      {/* Grants Table */}
      <div className="data-card">
        <div className="table-responsive">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th>Grant Code</th>
                <th>Project Purpose & Categories</th>
                <th>Donor</th>
                <th>Total Cap</th>
                <th>Allocated</th>
                <th>Spent</th>
                <th>Held</th>
                <th>Remaining</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredGrants.map(grant => (
                <tr key={grant.id}>
                  <td style={{ fontWeight: 600 }}>
                    <span className="code-font" style={{ fontSize: '13px' }}>{grant.grantCode}</span>
                  </td>
                  <td style={{ maxWidth: '280px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{grant.purpose}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Categories: {grant.allowedCategories.join(', ')}
                    </div>
                  </td>
                  <td>
                    <span className="status-pill simulated">{grant.donorId}</span>
                  </td>
                  <td className="tabular-nums" style={{ fontWeight: 600 }}>
                    ₹{(grant.authorizedAmountMinor / 100).toLocaleString()}
                  </td>
                  <td className="tabular-nums">
                    ₹{(grant.allocatedMinor / 100).toLocaleString()}
                  </td>
                  <td className="tabular-nums" style={{ color: 'var(--primary-evergreen)', fontWeight: 600 }}>
                    ₹{(grant.spentMinor / 100).toLocaleString()}
                  </td>
                  <td className="tabular-nums" style={{ color: grant.heldMinor > 0 ? '#DC2626' : 'var(--text-secondary)' }}>
                    ₹{(grant.heldMinor / 100).toLocaleString()}
                  </td>
                  <td className="tabular-nums" style={{ fontWeight: 600 }}>
                    ₹{(grant.remainingMinor / 100).toLocaleString()}
                  </td>
                  <td>
                    <span className="status-pill verified">{grant.status}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: '11px', padding: '3px 8px' }}
                        onClick={() => setSelectedGrant(grant)}
                      >
                        Inspect
                      </button>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: '11px', padding: '3px 8px' }}
                        onClick={() => handleOpenAddAllocation(grant)}
                      >
                        + Allocate
                      </button>
                      <button
                        className="btn btn-primary"
                        style={{
                          fontSize: '11px',
                          padding: '3px 8px',
                          background: 'var(--primary-evergreen)',
                          color: '#FFFFFF',
                          border: 'none',
                        }}
                        onClick={() => onNavigateToDonate?.(grant.id)}
                      >
                        💳 Donate
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Grant Details Drawer */}
      {selectedGrant && !showAllocModal && (
        <div className="drawer-backdrop" onClick={() => setSelectedGrant(null)}>
          <div className="drawer-panel" onClick={e => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <span className="code-font" style={{ fontWeight: 700, fontSize: '15px' }}>
                  {selectedGrant.grantCode}
                </span>
                <span className="status-pill verified" style={{ marginLeft: '8px' }}>
                  {selectedGrant.status}
                </span>
              </div>
              <button
                onClick={() => setSelectedGrant(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            </div>

            <div className="drawer-body">
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{selectedGrant.purpose}</h3>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Committed by <strong>{selectedGrant.donorId}</strong>
                </div>
              </div>

              {/* Financial Summary */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ padding: '10px', backgroundColor: 'var(--bg-subtle)', borderRadius: '4px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Authorized Cap</div>
                  <strong className="tabular-nums" style={{ fontSize: '14px' }}>
                    ₹{(selectedGrant.authorizedAmountMinor / 100).toLocaleString()}
                  </strong>
                </div>
                <div style={{ padding: '10px', backgroundColor: 'var(--bg-subtle)', borderRadius: '4px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Remaining Unspent</div>
                  <strong className="tabular-nums" style={{ fontSize: '14px', color: 'var(--primary-evergreen)' }}>
                    ₹{(selectedGrant.remainingMinor / 100).toLocaleString()}
                  </strong>
                </div>
              </div>

              {/* Authorized Categories */}
              <div>
                <h4 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Authorized Spending Categories
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {selectedGrant.allowedCategories.map((cat, i) => (
                    <span key={i} className="status-pill verified" style={{ fontSize: '11.5px' }}>
                      ✓ {cat}
                    </span>
                  ))}
                </div>
              </div>

              {/* Milestones */}
              <div>
                <h4 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Project Milestones ({selectedGrant.milestones.length})
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {selectedGrant.milestones.map(m => (
                    <div key={m.id} style={{ padding: '10px 12px', border: '1px solid var(--border-subtle)', borderRadius: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: '13px' }}>{m.title}</strong>
                        <span className={`status-pill ${m.isMet ? 'verified' : 'review'}`} style={{ fontSize: '10px' }}>
                          {m.isMet ? 'COMPLETED' : 'PENDING'}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{m.description}</div>
                      <div className="tabular-nums" style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Target: ₹{(m.amountMinor / 100).toLocaleString()} • Due: {m.targetDate}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Existing Allocations */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <h4 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0 }}>
                    Active Category Allocations
                  </h4>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: '11px', padding: '2px 6px' }}
                    onClick={() => handleOpenAddAllocation(selectedGrant)}
                  >
                    + Add Allocation
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {state.allocations.filter(a => a.grantId === selectedGrant.id).map(a => (
                    <div key={a.id} style={{ padding: '8px 10px', backgroundColor: 'var(--bg-subtle)', borderRadius: '4px', display: 'flex', justifyContent: 'space-between' }}>
                      <div>
                        <strong>{a.category}</strong>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Milestone: {a.milestoneId}</div>
                      </div>
                      <div className="tabular-nums" style={{ fontWeight: 600 }}>
                        ₹{(a.amountMinor / 100).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="drawer-footer">
              <button
                className="btn btn-primary"
                onClick={() => {
                  setSelectedGrant(null);
                  onSelectGrant(selectedGrant.id);
                }}
              >
                Open in Fund Flow Explorer →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create New Grant Modal */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <span>Create New Earmarked Grant</span>
              <button onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateGrant}>
              <div className="modal-body">
                {formError && (
                  <div style={{ padding: '8px 12px', backgroundColor: '#FEE2E2', color: '#991B1B', borderRadius: '4px', marginBottom: '12px', fontSize: '12.5px' }}>
                    {formError}
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Grant Code (Immutable ID):</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. CW-2026-020"
                    value={newGrantCode}
                    onChange={e => setNewGrantCode(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Purpose & Deliverable Scope:</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Solar Well & Community Distribution Mains"
                    value={newPurpose}
                    onChange={e => setNewPurpose(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group">
                    <label className="form-label">Donor Reference:</label>
                    <select className="form-select" value={newDonorId} onChange={e => setNewDonorId(e.target.value)}>
                      <option value="donor-northstar">Northstar Community Fund</option>
                      <option value="donor-global-horizon">Global Horizon Foundation</option>
                      <option value="donor-unicef-partner">UNICEF Partner Trust</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Authorized Cap (₹ INR):</label>
                    <input
                      type="number"
                      className="form-input"
                      value={newCapRupees}
                      onChange={e => setNewCapRupees(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Authorized Spending Categories (Comma-separated):</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Water Infrastructure, Sanitation Equipment"
                    value={newCategories}
                    onChange={e => setNewCategories(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Grant
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Allocation Modal */}
      {showAllocModal && selectedGrant && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <span>Add Allocation to {selectedGrant.grantCode}</span>
              <button onClick={() => setShowAllocModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>
                ✕
              </button>
            </div>
            <form onSubmit={handleAddAllocation}>
              <div className="modal-body">
                {allocError && (
                  <div style={{ padding: '8px 12px', backgroundColor: '#FEE2E2', color: '#991B1B', borderRadius: '4px', marginBottom: '12px', fontSize: '12.5px' }}>
                    {allocError}
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Select Category (Restricted to Authorized Grant Scope):</label>
                  <select
                    className="form-select"
                    value={allocCategory}
                    onChange={e => setAllocCategory(e.target.value)}
                    required
                  >
                    {selectedGrant.allowedCategories.map((cat, i) => (
                      <option key={i} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Amount (₹ INR):</label>
                  <input
                    type="number"
                    className="form-input"
                    value={allocAmountRupees}
                    onChange={e => setAllocAmountRupees(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Linked Milestone:</label>
                  <select
                    className="form-select"
                    value={allocMilestoneId}
                    onChange={e => setAllocMilestoneId(e.target.value)}
                    required
                  >
                    {selectedGrant.milestones.map(m => (
                      <option key={m.id} value={m.id}>{m.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAllocModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Confirm Allocation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
