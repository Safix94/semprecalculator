'use client';

import { useState } from 'react';
import { updateRfqNotes } from '@/actions/rfq';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface RfqNotesEditorProps {
  rfqId: string;
  initialNotes: string | null;
  disabled?: boolean;
}

export function RfqNotesEditor({ rfqId, initialNotes, disabled = false }: RfqNotesEditorProps) {
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [saving, setSaving] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setResultMessage(null);
    setError(null);

    const result = await updateRfqNotes(rfqId, notes);
    setSaving(false);

    if ('error' in result) {
      setError(result.error ?? 'Could not save notes');
      return;
    }

    setNotes(result.data.notes ?? '');
    setResultMessage('Notes saved');
  }

  return (
    <div className="space-y-3">
      <Textarea
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        rows={4}
        maxLength={5000}
        placeholder="Add notes for this RFQ"
        disabled={disabled || saving}
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {resultMessage && (
        <p className="text-sm text-muted-foreground">{resultMessage}</p>
      )}
      <Button type="button" size="sm" onClick={handleSave} disabled={disabled || saving}>
        {saving ? 'Saving...' : 'Save notes'}
      </Button>
    </div>
  );
}
