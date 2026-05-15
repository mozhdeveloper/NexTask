"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { reportService, type ReportType, type ExportFormat } from "@/services/report.service";
import { toast } from "sonner";
import { Label } from "@/components/ui/input";

export function ExportReportModal({
  open,
  onOpenChange,
  type,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  type: ReportType;
}) {
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      reportService.export(type, format);
      toast.success(`Exported ${reportService.label(type)}`);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export {reportService.label(type)}</DialogTitle>
          <DialogDescription>Choose your preferred format. Files are generated locally.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Format</Label>
          <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="csv">CSV (.csv)</SelectItem>
              <SelectItem value="xlsx">Excel-compatible (.xls)</SelectItem>
              <SelectItem value="pdf">PDF preview (.pdf.txt)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={run} disabled={busy}>{busy ? "Exporting…" : "Export"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
