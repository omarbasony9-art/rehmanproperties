import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { AdminLayout } from "@/components/layout/admin-layout";
import { 
  useGetAdminInquiry, 
  useUpdateAdminInquiry, 
  getGetAdminInquiryQueryKey,
  useGetAdminMe,
  InquiryDetailStatus
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  Loader2, 
  ArrowLeft,
  Calendar,
  Home,
  User,
  Phone,
  Mail,
  MapPin,
  Clock,
  Wrench,
  CheckCircle2,
  Info,
  Save,
  MessageSquare
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useSEO } from "@/hooks/use-seo";

const statusColors: Record<string, string> = {
  new: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  contacted: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-800",
  appointment: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  offer_made: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
  under_contract: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800",
  closed: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700",
  lost: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800",
};

const statusLabels: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  appointment: "Appointment",
  offer_made: "Offer Made",
  under_contract: "Under Contract",
  closed: "Closed",
  lost: "Lost",
};

export default function AdminInquiryDetail() {
  useSEO("Inquiry Detail | Rehman INC Admin", "Admin Portal");
  const params = useParams();
  const id = params.id ? parseInt(params.id, 10) : 0;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: me, isLoading: meLoading } = useGetAdminMe();
  
  const { data: inquiry, isLoading } = useGetAdminInquiry(id, {
    query: {
      enabled: !!id && !!me?.authenticated,
      queryKey: getGetAdminInquiryQueryKey(id)
    }
  });

  const updateInquiry = useUpdateAdminInquiry();
  const [notes, setNotes] = useState("");
  const initializedForId = useRef<number | null>(null);

  useEffect(() => {
    if (inquiry && initializedForId.current !== id) {
      initializedForId.current = id;
      setNotes(inquiry.notes || "");
    }
  }, [inquiry, id]);

  const handleStatusChange = (newStatus: string) => {
    updateInquiry.mutate({
      id,
      data: { status: newStatus as InquiryDetailStatus }
    }, {
      onSuccess: (updatedData) => {
        toast({ title: "Status updated" });
        queryClient.setQueryData(getGetAdminInquiryQueryKey(id), updatedData);
      },
      onError: () => {
        toast({ title: "Failed to update status", variant: "destructive" });
      }
    });
  };

  const handleSaveNotes = () => {
    updateInquiry.mutate({
      id,
      data: { notes }
    }, {
      onSuccess: (updatedData) => {
        toast({ title: "Notes saved successfully" });
        queryClient.setQueryData(getGetAdminInquiryQueryKey(id), updatedData);
      },
      onError: () => {
        toast({ title: "Failed to save notes", variant: "destructive" });
      }
    });
  };

  if (meLoading || (isLoading && !!id)) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!me?.authenticated || !id) {
    setLocation("/admin");
    return null;
  }

  if (!inquiry) {
    return (
      <AdminLayout>
        <div className="p-10 flex flex-col items-center justify-center h-full text-muted-foreground">
          <Info className="w-12 h-12 mb-4" />
          <h2 className="text-xl font-medium">Inquiry not found</h2>
          <Button variant="link" onClick={() => setLocation("/admin/dashboard")}>Return to Dashboard</Button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 md:p-10 flex-1 overflow-y-auto bg-muted/10">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => setLocation("/admin/dashboard")} className="rounded-full bg-background">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-serif font-bold text-foreground">
                  {inquiry.inquiryNumber}
                </h1>
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${statusColors[inquiry.status]}`}>
                  {statusLabels[inquiry.status]}
                </span>
              </div>
              <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                <Calendar className="w-3.5 h-3.5" /> 
                Submitted on {new Date(inquiry.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
          
          <div className="w-full md:w-auto bg-background p-1.5 rounded-lg border border-border shadow-sm flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground px-2">Update Status:</span>
            <Select value={inquiry.status} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(statusLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* LEFT COLUMN - INFO */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* PROPERTY INFO */}
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-border bg-muted/20 font-medium flex items-center gap-2">
                <Home className="w-4 h-4 text-primary" /> Property Information
              </div>
              <div className="p-6">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <MapPin className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">{inquiry.address}</h3>
                    <p className="text-muted-foreground text-lg">{inquiry.city}, {inquiry.state} {inquiry.zip}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-4 border-t border-border pt-6">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Property Type</p>
                    <p className="font-medium capitalize">{inquiry.propertyType?.replace('_', ' ') || 'Not specified'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Bed / Bath</p>
                    <p className="font-medium">
                      {inquiry.bedrooms || '-'} / {inquiry.bathrooms || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Sq Footage</p>
                    <p className="font-medium">{inquiry.squareFootage ? `${inquiry.squareFootage} sqft` : 'Not specified'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Occupied</p>
                    <p className="font-medium capitalize">{inquiry.occupied || 'Not specified'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* SELLING SITUATION */}
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-border bg-muted/20 font-medium flex items-center gap-2">
                <Info className="w-4 h-4 text-primary" /> Selling Situation & Condition
              </div>
              <div className="p-6 grid md:grid-cols-2 gap-8">
                <div>
                  <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                    <Clock className="w-4 h-4" /> <span className="font-medium">Timeline to Sell</span>
                  </div>
                  <p className="text-foreground capitalize font-medium">{inquiry.sellingTimeline?.replace(/_/g, ' ') || 'Not specified'}</p>
                  
                  <div className="mt-6 flex items-center gap-2 mb-2 text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4" /> <span className="font-medium">Condition</span>
                  </div>
                  <p className="text-foreground capitalize font-medium">{inquiry.propertyCondition?.replace(/_/g, ' ') || 'Not specified'}</p>
                </div>
                
                <div>
                  <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                    <MessageSquare className="w-4 h-4" /> <span className="font-medium">Reason for Selling</span>
                  </div>
                  <p className="text-foreground bg-muted/50 p-3 rounded-md min-h-[60px] text-sm">
                    {inquiry.sellingReason || <span className="italic opacity-50">No reason provided</span>}
                  </p>
                  
                  <div className="mt-6 flex items-center gap-2 mb-2 text-muted-foreground">
                    <Wrench className="w-4 h-4" /> <span className="font-medium">Known Repairs Needed</span>
                  </div>
                  <p className="text-foreground bg-muted/50 p-3 rounded-md min-h-[60px] text-sm">
                    {inquiry.repairs || <span className="italic opacity-50">No repairs specified</span>}
                  </p>
                </div>
              </div>
            </div>

            {/* PHOTOS */}
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-border bg-muted/20 font-medium flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Home className="w-4 h-4 text-primary" /> Property Photos
                </div>
                <span className="text-xs bg-muted px-2 py-1 rounded text-muted-foreground">{inquiry.photos?.length || 0} photos</span>
              </div>
              <div className="p-6">
                {(!inquiry.photos || inquiry.photos.length === 0) ? (
                  <div className="text-center p-8 bg-muted/30 border border-dashed border-border rounded-lg text-muted-foreground">
                    No photos submitted with this inquiry.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {inquiry.photos.map((photo) => {
                      // In dev, R2 isn't fully set up with a public URL in the response
                      // We'll show the key as a placeholder for where the image would be
                      const url = import.meta.env.VITE_R2_PUBLIC_URL 
                        ? `${import.meta.env.VITE_R2_PUBLIC_URL}/${photo.objectKey}`
                        : '';
                        
                      return (
                        <div key={photo.id} className="relative aspect-square rounded-md border border-border bg-muted overflow-hidden flex flex-col items-center justify-center p-2 text-center break-all">
                          {url ? (
                            <img src={url} alt={photo.originalFilename} className="w-full h-full object-cover" />
                          ) : (
                            <>
                              <span className="text-xs text-muted-foreground mb-1">Image Placeholder</span>
                              <span className="text-[10px] font-mono">{photo.objectKey.split('/').pop()}</span>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

          </div>
          
          {/* RIGHT COLUMN - CONTACT & NOTES */}
          <div className="space-y-6">
            
            {/* CONTACT INFO */}
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-border bg-muted/20 font-medium flex items-center gap-2">
                <User className="w-4 h-4 text-primary" /> Seller Contact
              </div>
              <div className="p-6 space-y-5">
                <div>
                  <h3 className="text-xl font-bold text-foreground">{inquiry.fullName}</h3>
                  <p className="text-sm text-muted-foreground mt-1 bg-primary/10 text-primary w-fit px-2 py-0.5 rounded-sm capitalize">
                    Prefers {inquiry.preferredContact}
                  </p>
                </div>
                
                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border border-border">
                    <Phone className="w-5 h-5 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Phone</p>
                      <p className="font-medium">{inquiry.phone}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border border-border">
                    <Mail className="w-5 h-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Email</p>
                      <p className="font-medium truncate">{inquiry.email}</p>
                    </div>
                  </div>
                </div>
                
                <div className="border-t border-border pt-4 mt-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">Source / Tracking</p>
                  <div className="text-xs space-y-1">
                    <p><span className="text-muted-foreground">Source:</span> {inquiry.source || 'Direct'}</p>
                    {inquiry.utmCampaign && <p><span className="text-muted-foreground">Campaign:</span> {inquiry.utmCampaign}</p>}
                    {inquiry.utmSource && <p><span className="text-muted-foreground">UTM Source:</span> {inquiry.utmSource}</p>}
                  </div>
                </div>
              </div>
            </div>

            {/* INTERNAL NOTES */}
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col h-[400px]">
              <div className="p-4 border-b border-border bg-muted/20 font-medium flex items-center gap-2">
                <Info className="w-4 h-4 text-primary" /> Internal Notes
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <Textarea 
                  className="flex-1 resize-none bg-muted/20 border-border focus-visible:ring-primary/50 text-base p-4"
                  placeholder="Add private notes about this property, seller conversations, or evaluation details..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
                <Button 
                  className="w-full mt-4 bg-primary text-primary-foreground" 
                  onClick={handleSaveNotes}
                  disabled={notes === (inquiry.notes || "") || updateInquiry.isPending}
                >
                  {updateInquiry.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Save Notes
                </Button>
              </div>
            </div>

          </div>
        </div>
        
      </div>
    </AdminLayout>
  );
}
