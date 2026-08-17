import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetAdminMe } from "@workspace/api-client-react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  getProperties, createProperty, updateProperty, deleteProperty,
  type Property,
} from "@/lib/admin-api";
import {
  Plus, Pencil, Trash2, Star, Loader2, X, Check, Building2,
} from "lucide-react";

type FormState = Omit<Property, "id" | "createdAt" | "updatedAt">;
const emptyForm = (): FormState => ({
  title: "", displayAddress: null, propertyType: null, description: null,
  status: "published", featured: false, sortOrder: 0, imageKeys: [],
});

export default function AdminProperties() {
  const [, setLocation] = useLocation();
  const { data: me, isLoading: meLoading } = useGetAdminMe();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [editing, setEditing] = useState<Property | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());

  const { data: properties = [], isLoading } = useQuery({
    queryKey: ["admin-properties"],
    queryFn: getProperties,
    enabled: !!me?.authenticated,
  });

  const saveMutation = useMutation({
    mutationFn: async (f: FormState) => {
      if (editing) return updateProperty(editing.id, f);
      return createProperty(f);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-properties"] });
      qc.invalidateQueries({ queryKey: ["site-properties"] });
      toast({ title: editing ? "Property updated" : "Property created" });
      setEditing(null); setCreating(false); setForm(emptyForm());
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProperty,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-properties"] }); qc.invalidateQueries({ queryKey: ["site-properties"] }); toast({ title: "Property deleted" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (meLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!me?.authenticated) { setLocation("/admin"); return null; }

  const startEdit = (p: Property) => { setEditing(p); setForm({ title: p.title, displayAddress: p.displayAddress, propertyType: p.propertyType, description: p.description, status: p.status, featured: p.featured, sortOrder: p.sortOrder, imageKeys: p.imageKeys }); setCreating(false); };
  const startCreate = () => { setEditing(null); setForm(emptyForm()); setCreating(true); };
  const cancel = () => { setEditing(null); setCreating(false); setForm(emptyForm()); };

  const showForm = editing !== null || creating;

  return (
    <AdminLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Properties</h1>
            <p className="text-muted-foreground text-sm mt-1">Manage property listings shown on the website.</p>
          </div>
          {!showForm && (
            <Button onClick={startCreate}>
              <Plus className="w-4 h-4 mr-2" /> Add Property
            </Button>
          )}
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-card border border-border rounded-xl p-6 mb-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-4">{editing ? "Edit Property" : "New Property"}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-muted-foreground block mb-1.5">Title *</label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. 3BR Ranch — Princeton, NJ" />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1.5">Display Address / Location</label>
                <Input value={form.displayAddress ?? ""} onChange={e => setForm(f => ({ ...f, displayAddress: e.target.value || null }))} placeholder="e.g. Princeton, NJ 08540" />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1.5">Property Type</label>
                <Select value={form.propertyType ?? ""} onValueChange={v => setForm(f => ({ ...f, propertyType: v || null }))}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {["Single Family", "Multi Family", "Condo", "Townhouse", "Land", "Other"].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1.5">Status</label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1.5">Sort Order</label>
                <Input type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-muted-foreground block mb-1.5">Description</label>
                <Textarea rows={4} value={form.description ?? ""} onChange={e => setForm(f => ({ ...f, description: e.target.value || null }))} placeholder="Property details, highlights, condition..." />
              </div>
              <div className="md:col-span-2 flex items-center gap-2">
                <input type="checkbox" id="featured" checked={form.featured} onChange={e => setForm(f => ({ ...f, featured: e.target.checked }))} className="w-4 h-4" />
                <label htmlFor="featured" className="text-sm font-medium">Featured property</label>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending || !form.title.trim()}>
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                {editing ? "Save Changes" : "Create Property"}
              </Button>
              <Button variant="outline" onClick={cancel}><X className="w-4 h-4 mr-2" />Cancel</Button>
            </div>
          </div>
        )}

        {/* List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : properties.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground border border-dashed border-border rounded-xl">
            <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No properties yet</p>
            <p className="text-sm mt-1">Click "Add Property" to create your first listing.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {properties.map(p => (
              <div key={p.id} className="bg-card border border-border rounded-xl p-4 flex items-start justify-between gap-4 shadow-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold truncate">{p.title}</span>
                    {p.featured && <Star className="w-4 h-4 text-amber-500 shrink-0" fill="currentColor" />}
                    <Badge variant={p.status === "published" ? "default" : "secondary"} className="text-xs shrink-0">
                      {p.status}
                    </Badge>
                  </div>
                  {p.displayAddress && <p className="text-sm text-muted-foreground mt-0.5">{p.displayAddress}</p>}
                  {p.propertyType && <p className="text-xs text-muted-foreground mt-0.5">{p.propertyType}</p>}
                  {p.description && <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">{p.description}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => startEdit(p)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => { if (confirm(`Delete "${p.title}"?`)) deleteMutation.mutate(p.id); }}
                    disabled={deleteMutation.isPending}
                  >
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
