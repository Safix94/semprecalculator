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
  materialId?: string | null;
  /** When true, only "Send to supplier" is shown for draft (e.g. when modal has its own "Send to pricing team" button). */
  hidePricingTeamButton?: boolean;
}

export function RfqActions({ rfqId, status, materialId = null, hidePricingTeamButton = false }: RfqActionsProps) {
  const [loading, setLoading] = useState(false);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [saveAndSendLoading, setSaveAndSendLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([]);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!pickerOpen) {
      return;
    }

    setSelectedSupplierIds([]);
    setPickerError(null);
    setSuppliers([]);

    if (!materialId) {
      setSuppliersLoading(false);
      setPickerError('RFQ heeft geen material_id; kan suppliers niet ophalen.');
      return;
    }
    const targetMaterialId = materialId;

    let active = true;

    async function loadSuppliers() {
      setSuppliersLoading(true);
      try {
        const supplierRows = await getSuppliersForMaterial(targetMaterialId);
        if (!active) {
          return;
        }
        setSuppliers(supplierRows);
      } catch (error) {
        if (!active) {
          return;
        }
        console.error('Failed to load suppliers for send fallback:', error);
        setSuppliers([]);
        setPickerError('Could not load suppliers for this material.');
      } finally {
        if (active) {
          setSuppliersLoading(false);
        }
      }
    }

    loadSuppliers();

    return () => {
      active = false;
    };
  }, [materialId, pickerOpen]);

  const canSaveAndSend = useMemo(() => {
    if (!materialId || suppliersLoading || saveAndSendLoading || pricingLoading) {
      return false;
    }
    if (suppliers.length === 0) {
      return false;
    }
    return selectedSupplierIds.length > 0;
  }, [materialId, pricingLoading, saveAndSendLoading, selectedSupplierIds.length, suppliers.length, suppliersLoading]);

  const formatActionError = (error: unknown) =>
    typeof error === 'string' ? error : JSON.stringify(error);

  function handleSupplierToggle(supplierId: string, checked: boolean) {
    setSelectedSupplierIds((current) =>
      checked ? [...current, supplierId] : current.filter((id) => id !== supplierId)
    );
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
    if (selectedSupplierIds.length === 0) {
      setPickerError('Select at least one supplier');
      return;
    }

    setSaveAndSendLoading(true);
    setPickerError(null);
    setResult(null);

    try {
      const inviteResult = await replaceRfqInvites(rfqId, selectedSupplierIds);
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
      setSelectedSupplierIds([]);
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
              This RFQ has no invites yet. Select one or more suppliers, then send again.
            </DialogDescription>
          </DialogHeader>

          {pickerError && <p className="text-sm text-destructive">{pickerError}</p>}

          {suppliersLoading ? (
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
