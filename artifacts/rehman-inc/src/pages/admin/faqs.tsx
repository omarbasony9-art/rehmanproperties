import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetAdminMe } from "@workspace/api-client-react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getFaqs, createFaq, updateFaq, deleteFaq, type Faq } from "@/lib/admin-api";
import { Plus, Pencil, Trash2, Loader2, X, Check, ChevronUp, ChevronDown, HelpCircle } from "lucide-react";

export default function AdminFaqs() {
  const [, setLocation] = useLocation();
  const { data: me, isLoading: meLoading } = useGetAdminMe();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [editing, setEditing] = useState<Faq | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ question: "", answer: "", published: true });

  const { data: faqs = [], isLoading } = useQuery({
    queryKey: ["admin-faqs"],
    queryFn: getFaqs,
    enabled: !!me?.authenticated,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) return updateFaq(editing.id, { ...form, sortOrder: editing.sortOrder });
      return createFaq({ ...form, sortOrder: faqs.length });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-faqs"] });
      qc.invalidateQueries({ queryKey: ["site-faqs"] });
      toast({ title: editing ? "FAQ updated" : "FAQ created" });
      setEditing(null); setCreating(false); setForm({ question: "", answer: "", published: true });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFaq,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-faqs"] }); qc.invalidateQueries({ queryKey: ["site-faqs"] }); toast({ title: "FAQ deleted" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const moveMutation = useMutation({
    mutationFn: async ({ id, dir }: { id: number; dir: -1 | 1 }) => {
      const sorted = [...faqs].sort((a, b) => a.sortOrder - b.sortOrder);
      const idx = sorted.findIndex(f => f.id === id);
      const swapIdx = idx + dir;
      if (swapIdx < 0 || swapIdx >= sorted.length) return;
      await Promise.all([
        updateFaq(sorted[idx].id, { sortOrder: swapIdx }),
        updateFaq(sorted[swapIdx].id, { sortOrder: idx }),
      ]);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-faqs"] }); qc.invalidateQueries({ queryKey: ["site-faqs"] }); },
  });

  const togglePublish = useMutation({
    mutationFn: (faq: Faq) => updateFaq(faq.id, { published: !faq.published }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-faqs"] }); qc.invalidateQueries({ queryKey: ["site-faqs"] }); },
  });

  if (meLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!me?.authenticated) { setLocation("/admin"); return null; }

  const sorted = [...faqs].sort((a, b) => a.sortOrder - b.sortOrder);
  const showForm = editing !== null || creating;

  const startEdit = (f: Faq) => { setEditing(f); setForm({ question: f.question, answer: f.answer, published: f.published }); setCreating(false); };
  const startCreate = () => { setEditing(null); setForm({ question: "", answer: "", published: true }); setCreating(true); };
  const cancel = () => { setEditing(null); setCreating(false); setForm({ question: "", answer: "", published: true }); };

  return (
    <AdminLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">FAQs</h1>
            <p className="text-muted-foreground text-sm mt-1">Manage the FAQ page. Changes appear live on the website.</p>
          </div>
          {!showForm && <Button onClick={startCreate}><Plus className="w-4 h-4 mr-2" />Add FAQ</Button>}
        </div>

        {showForm && (
          <div className="bg-card border border-border rounded-xl p-6 mb-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-4">{editing ? "Edit FAQ" : "New FAQ"}</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1.5">Question *</label>
                <Input value={form.question} onChange={e => setForm(f => ({ ...f, question: e.target.value }))} placeholder="e.g. How does the process work?" />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1.5">Answer *</label>
                <Textarea rows={5} value={form.answer} onChange={e => setForm(f => ({ ...f, answer: e.target.value }))} placeholder="Detailed answer..." />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="faq-pub" checked={form.published} onChange={e => setForm(f => ({ ...f, published: e.target.checked }))} className="w-4 h-4" />
                <label htmlFor="faq-pub" className="text-sm font-medium">Published (visible on website)</label>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.question.trim() || !form.answer.trim()}>
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                {editing ? "Save Changes" : "Create FAQ"}
              </Button>
              <Button variant="outline" onClick={cancel}><X className="w-4 h-4 mr-2" />Cancel</Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground border border-dashed border-border rounded-xl">
            <HelpCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No FAQs yet</p>
            <p className="text-sm mt-1">Click "Add FAQ" to create your first question.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map((faq, idx) => (
              <div key={faq.id} className="bg-card border border-border rounded-xl p-4 flex items-start gap-3 shadow-sm">
                <div className="flex flex-col gap-1 shrink-0 mt-0.5">
                  <button onClick={() => moveMutation.mutate({ id: faq.id, dir: -1 })} disabled={idx === 0 || moveMutation.isPending} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5">
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button onClick={() => moveMutation.mutate({ id: faq.id, dir: 1 })} disabled={idx === sorted.length - 1 || moveMutation.isPending} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5">
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{faq.question}</span>
                    <Badge variant={faq.published ? "default" : "secondary"} className="text-xs cursor-pointer" onClick={() => togglePublish.mutate(faq)}>
                      {faq.published ? "Published" : "Draft"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{faq.answer}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => startEdit(faq)}><Pencil className="w-4 h-4" /></Button>
                  <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => { if (confirm("Delete this FAQ?")) deleteMutation.mutate(faq.id); }} disabled={deleteMutation.isPending}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
