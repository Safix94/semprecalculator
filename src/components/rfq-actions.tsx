'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSuppliersForMaterial } from '@/actions/materials';
import { closeRfq, replaceRfqInvites, sendRfq, sendToPricingTeam } from '@/actions/rfq';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import type { RfqStatus, Supplier } from '@/types';

interface RfqActionsProps {
  rfqId: string;
  status: RfqStatus;
  productType?: string | null;
  materialId?: string | null;
  materialIdTableTop?: string | null;
  materialIdTableFoot?: string | null;
  /** When true, only "Send to supplier" is shown for draft (e.g. when modal has its own "Send to pricing team" button). */
  hidePricingTeamButton?: boolean;
}

export function RfqActions({
  rfqId,
  status,
  productType = null,
  materialId = null,
  materialIdTableTop = null,
  materialIdTableFoot = null,
  hidePricingTeamButton = false,
}: RfqActionsProps) {
  const [loading, setLoading] = useState(false);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [saveAndSendLoading, setSaveAndSendLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([]);

  const [tableTopSuppliersLoading, setTableTopSuppliersLoading] = useState(false);
  const [tableTopSuppliersError, setTableTopSuppliersError] = useState<string | null>(null);
  const [tableTopSuppliers, setTableTopSuppliers] = useState<Supplier[]>([]);
  const [selectedTableTopSupplierIds, setSelectedTableTopSupplierIds] = useState<string[]>([]);

  const [tableFootSuppliersLoading, setTableFootSuppliersLoading] = useState(false);
  const [tableFootSuppliersError, setTableFootSuppliersError] = useState<string | null>(null);
  const [tableFootSuppliers, setTableFootSuppliers] = useState<Supplier[]>([]);
  const [selectedTableFootSupplierIds, setSelectedTableFootSupplierIds] = useState<string[]>([]);

  const router = useRouter();
  const isTablesType = productType?.trim().toLowerCase() === 'tables';

  useEffect(() => {
    if (!pickerOpen) {
      return;
    }

    setPickerError(null);
    setSuppliers([]);
    setSelectedSupplierIds([]);
    setSuppliersLoading(false);

    setTableTopSuppliers([]);
    setTableTopSuppliersError(null);
    setTableTopSuppliersLoading(false);
    setSelectedTableTopSupplierIds([]);

    setTableFootSuppliers([]);
    setTableFootSuppliersError(null);
    setTableFootSuppliersLoading(false);
    setSelectedTableFootSupplierIds([]);

    let active = true;

    async function loadSuppliersForMaterial(materialId: string) {
      const supplierResult = await getSuppliersForMaterial(materialId);
      if ('error' in supplierResult) {
        return { data: [] as Supplier[], error: supplierResult.error };
      }
      return { data: supplierResult.data, error: null as string | null };
    }

    async function loadNonTablesSuppliers() {
      if (!materialId) {
        setPickerError('RFQ has no material; cannot load suppliers.');
        return;
      }

      setSuppliersLoading(true);
      try {
        const supplierResult = await loadSuppliersForMaterial(materialId);
        if (!active) return;

        setSuppliers(supplierResult.data);
        if (supplierResult.error) {
          setPickerError(supplierResult.error);
        }
      } catch (error) {
        if (!active) return;
        console.error('Failed to load suppliers for send fallback:', error);
        setPickerError('Could not load suppliers for this material.');
      } finally {
        if (active) {
          setSuppliersLoading(false);
        }
      }
    }

    async function loadTablesSuppliers() {
      if (!materialIdTableTop || !materialIdTableFoot) {
        setPickerError('Tables RFQ is missing table top or table foot material.');
        return;
      }

      setTableTopSuppliersLoading(true);
      setTableFootSuppliersLoading(true);

      try {
        const [topResult, footResult] = await Promise.all([
          loadSuppliersForMaterial(materialIdTableTop),
          loadSuppliersForMaterial(materialIdTableFoot),
        ]);
        if (!active) return;

        setTableTopSuppliers(topResult.data);
        setTableTopSuppliersError(topResult.error);

        setTableFootSuppliers(footResult.data);
        setTableFootSuppliersError(footResult.error);
      } catch (error) {
        if (!active) return;
        console.error('Failed to load table suppliers for send fallback:', error);
        setPickerError('Could not load suppliers for the selected table materials.');
      } finally {
        if (active) {
          setTableTopSuppliersLoading(false);
          setTableFootSuppliersLoading(false);
        }
      }
    }

    if (isTablesType) {
      void loadTablesSuppliers();
    } else {
      void loadNonTablesSuppliers();
    }

    return () => {
      active = false;
    };
  }, [isTablesType, materialId, materialIdTableFoot, materialIdTableTop, pickerOpen]);

  const canSaveAndSend = useMemo(() => {
    if (saveAndSendLoading || pricingLoading) {
      return false;
    }

    if (isTablesType) {
      if (tableTopSuppliersLoading || tableFootSuppliersLoading) {
        return false;
      }
      if (tableTopSuppliers.length === 0 || tableFootSuppliers.length === 0) {
        return false;
      }
      return selectedTableTopSupplierIds.length > 0 && selectedTableFootSupplierIds.length > 0;
    }

    if (!materialId || suppliersLoading || suppliers.length === 0) {
      return false;
    }
    return selectedSupplierIds.length > 0;
  }, [
    isTablesType,
    materialId,
    pricingLoading,
    saveAndSendLoading,
    selectedSupplierIds.length,
    selectedTableFootSupplierIds.length,
    selectedTableTopSupplierIds.length,
    suppliers.length,
    suppliersLoading,
    tableFootSuppliers.length,
    tableFootSuppliersLoading,
    tableTopSuppliers.length,
    tableTopSuppliersLoading,
  ]);

  const formatActionError = (error: unknown) =>
    typeof error === 'string' ? error : JSON.stringify(error);

  function toggleSupplierId(selectedIds: string[], supplierId: string, checked: boolean): string[] {
    if (checked) {
      return [...new Set([...selectedIds, supplierId])];
    }
    return selectedIds.filter((id) => id !== supplierId);
  }

  function handleSupplierToggle(supplierId: string, checked: boolean) {
    setSelectedSupplierIds((current) => toggleSupplierId(current, supplierId, checked));
  }

  function handleTableTopSupplierToggle(supplierId: string, checked: boolean) {
    setSelectedTableTopSupplierIds((current) => toggleSupplierId(current, supplierId, checked));
  }

  function handleTableFootSupplierToggle(supplierId: string, checked: boolean) {
    setSelectedTableFootSupplierIds((current) => toggleSupplierId(current, supplierId, checked));
  }

  async function handleSend() {
    if (!confirm('Are you sure you want to send this request to suppliers?')) return;
    setLoading(true);
    setResult(null);

    try {
      const res = await sendRfq(rfqId);

      if ('error' in res) {
        const errorMessage = formatActionError(res.error);
        if (errorMessage === 'No suppliers selected for this RFQ') {
          setPickerOpen(true);
        } else {
          setResult(`Error: ${errorMessage}`);
        }
      } else if ('data' in res) {
        setResult(`Sent to ${res.data.sent}/${res.data.total} suppliers`);
        router.refresh();
      }
    } catch (error) {
      console.error('Failed to send RFQ:', error);
      setResult('Error: Failed to send RFQ');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveAndSend() {
    if (isTablesType) {
      if (selectedTableTopSupplierIds.length === 0) {
        setPickerError('Select at least one supplier for the table top');
        return;
      }
      if (selectedTableFootSupplierIds.length === 0) {
        setPickerError('Select at least one supplier for the table foot');
        return;
      }
    } else if (selectedSupplierIds.length === 0) {
      setPickerError('Select at least one supplier');
      return;
    }

    setSaveAndSendLoading(true);
    setPickerError(null);
    setResult(null);

    try {
      const inviteResult = isTablesType
        ? await replaceRfqInvites(rfqId, {
            supplierIdsTableTop: selectedTableTopSupplierIds,
            supplierIdsTableFoot: selectedTableFootSupplierIds,
          })
        : await replaceRfqInvites(rfqId, selectedSupplierIds);

      if ('error' in inviteResult) {
        setPickerError(formatActionError(inviteResult.error));
        return;
      }

      const sendResult = await sendRfq(rfqId);
      if ('error' in sendResult) {
        const errorMessage = formatActionError(sendResult.error);
        setResult(`Error: ${errorMessage}`);
        setPickerError(errorMessage);
        return;
      }

      setResult(`Sent to ${sendResult.data.sent}/${sendResult.data.total} suppliers`);
      setPickerOpen(false);
      router.refresh();
    } catch (error) {
      console.error('Failed to save suppliers and send RFQ:', error);
      setPickerError('Failed to save suppliers and send RFQ.');
    } finally {
      setSaveAndSendLoading(false);
    }
  }

  async function handleClose() {
    if (!confirm('Are you sure you want to close this request?')) return;
    setLoading(true);

    try {
      const res = await closeRfq(rfqId);
      if (res.error) {
        setResult(`Error: ${res.error}`);
      }

      router.refresh();
    } catch (error) {
      console.error('Failed to close RFQ:', error);
      setResult('Error: Failed to close RFQ');
    } finally {
      setLoading(false);
    }
  }

  async function handleSendToPricing() {
    setPricingLoading(true);
    setResult(null);

    try {
      const res = await sendToPricingTeam(rfqId);
      if ('error' in res) {
        setResult(`Error: ${formatActionError(res.error)}`);
      } else {
        setResult(`Sent to pricing team (${res.data.sent}/${res.data.total})`);
        router.refresh();
      }
    } catch (error) {
      console.error('Failed to send RFQ to pricing team:', error);
      setResult('Error: Failed to notify pricing team');
    } finally {
      setPricingLoading(false);
    }
  }

  function renderSupplierSelector(params: {
    title: string;
    loading: boolean;
    error: string | null;
    suppliers: Supplier[];
    selectedSupplierIds: string[];
    onToggle: (supplierId: string, checked: boolean) => void;
    idPrefix: string;
  }) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">{params.title}</p>
        {params.loading ? (
          <p className="text-sm text-muted-foreground">Loading suppliers...</p>
        ) : params.error ? (
          <p className="text-sm text-destructive">{params.error}</p>
        ) : params.suppliers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No suppliers available for this material.</p>
        ) : (
          <div className="max-h-52 space-y-3 overflow-y-auto pr-1">
            {params.suppliers.map((supplier) => (
              <div key={supplier.id} className="flex items-start gap-3 rounded-md border p-3">
                <Checkbox
                  id={`${params.idPrefix}-${supplier.id}`}
                  checked={params.selectedSupplierIds.includes(supplier.id)}
                  onCheckedChange={(checked) => params.onToggle(supplier.id, checked === true)}
                  disabled={saveAndSendLoading}
                />
                <div className="grid gap-1">
                  <Label
                    htmlFor={`${params.idPrefix}-${supplier.id}`}
                    className="cursor-pointer text-sm font-medium"
                  >
                    {supplier.name}
                  </Label>
                  <p className="text-xs text-muted-foreground">{supplier.email}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {status === 'draft' && (
          <>
            {!hidePricingTeamButton && (
              <Button
                key="send-to-pricing-team"
                onClick={handleSendToPricing}
                disabled={loading || pricingLoading || saveAndSendLoading}
                variant="secondary"
                className="shrink-0"
              >
                {pricingLoading ? 'Loading...' : 'Send to pricing team'}
              </Button>
            )}
            <Button
              key="send-to-supplier"
              onClick={handleSend}
              disabled={loading || pricingLoading || saveAndSendLoading}
              className="shrink-0"
            >
              {loading ? 'Loading...' : 'Send to supplier'}
            </Button>
          </>
        )}
        {status === 'sent_to_pricing' && (
          <Button
            key="send-to-supplier"
            onClick={handleSend}
            disabled={loading || pricingLoading || saveAndSendLoading}
            className="shrink-0"
          >
            {loading ? 'Loading...' : 'Send to supplier'}
          </Button>
        )}
        {(status === 'sent_to_supplier' || status === 'quotes_received') && (
          <Button onClick={handleClose} disabled={loading || pricingLoading || saveAndSendLoading} variant="secondary">
            {loading ? 'Loading...' : 'Close'}
          </Button>
        )}
        {result && <span className="min-w-0 shrink text-sm text-muted-foreground">{result}</span>}
      </div>

      <Dialog
        open={pickerOpen}
        onOpenChange={(open) => {
          if (!saveAndSendLoading) {
            setPickerOpen(open);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Select suppliers</DialogTitle>
            <DialogDescription>
              This RFQ has no invites yet. Select suppliers, then send again.
            </DialogDescription>
          </DialogHeader>

          {pickerError && <p className="text-sm text-destructive">{pickerError}</p>}

          {isTablesType ? (
            <div className="space-y-4">
              {renderSupplierSelector({
                title: 'Suppliers for table top',
                loading: tableTopSuppliersLoading,
                error: tableTopSuppliersError,
                suppliers: tableTopSuppliers,
                selectedSupplierIds: selectedTableTopSupplierIds,
                onToggle: handleTableTopSupplierToggle,
                idPrefix: 'table-top-supplier',
              })}
              {renderSupplierSelector({
                title: 'Suppliers for table foot',
                loading: tableFootSuppliersLoading,
                error: tableFootSuppliersError,
                suppliers: tableFootSuppliers,
                selectedSupplierIds: selectedTableFootSupplierIds,
                onToggle: handleTableFootSupplierToggle,
                idPrefix: 'table-foot-supplier',
              })}
            </div>
          ) : suppliersLoading ? (
            <p className="text-sm text-muted-foreground">Loading suppliers...</p>
          ) : suppliers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No suppliers available for this material.</p>
          ) : (
            <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
              {suppliers.map((supplier) => (
                <div key={supplier.id} className="flex items-start gap-3 rounded-md border p-3">
                  <Checkbox
                    id={`fallback-supplier-${supplier.id}`}
                    checked={selectedSupplierIds.includes(supplier.id)}
                    onCheckedChange={(checked) => handleSupplierToggle(supplier.id, checked === true)}
                    disabled={saveAndSendLoading}
                  />
                  <div className="grid gap-1">
                    <Label
                      htmlFor={`fallback-supplier-${supplier.id}`}
                      className="cursor-pointer text-sm font-medium"
                    >
                      {supplier.name}
                    </Label>
                    <p className="text-xs text-muted-foreground">{supplier.email}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPickerOpen(false)}
              disabled={saveAndSendLoading}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSaveAndSend} disabled={!canSaveAndSend}>
              {saveAndSendLoading ? 'Saving...' : 'Save & Send'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
