import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { CheckCircle2, ArrowRight, ArrowLeft, UploadCloud, X, Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useSubmitInquiry, useGetUploadUrl } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  address: z.string().min(3, "Address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(2, "State is required"),
  zip: z.string().min(5, "ZIP is required"),
  propertyType: z.enum(["single_family", "multi_family", "condo", "townhouse", "land", "other"]).optional(),
  bedrooms: z.string().optional(),
  bathrooms: z.string().optional(),
  squareFootage: z.string().optional(),
  occupied: z.string().optional(),
  propertyCondition: z.enum(["excellent", "good", "needs_some_work", "needs_major_repairs"]).optional(),
  repairs: z.string().optional(),
  sellingReason: z.string().optional(),
  sellingTimeline: z.enum(["asap", "within_30_days", "one_to_three_months", "three_to_six_months", "just_exploring"]).optional(),
  fullName: z.string().min(2, "Name is required"),
  email: z.string().email("Invalid email"),
  phone: z.string().min(10, "Phone number is required"),
  preferredContact: z.enum(["call", "text", "email"], { required_error: "Please select a preferred contact method" }),
  contactConsent: z.boolean().refine((val) => val === true, {
    message: "You must agree to be contacted.",
  }),
});

type FormValues = z.infer<typeof formSchema>;

export function MultiStepForm({ 
  open, 
  onOpenChange, 
  initialAddress = "" 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  initialAddress?: string;
}) {
  const [step, setStep] = useState(1);
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoKeys, setPhotoKeys] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [successData, setSuccessData] = useState<{ inquiryNumber: string; firstName?: string } | null>(null);
  
  const { toast } = useToast();
  const submitInquiry = useSubmitInquiry();
  const getUploadUrl = useGetUploadUrl();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      address: initialAddress,
      city: "",
      state: "",
      zip: "",
      fullName: "",
      email: "",
      phone: "",
      preferredContact: "call",
      contactConsent: false,
    },
  });

  // Reset form when opened
  useState(() => {
    if (open && !successData) {
      form.reset({ ...form.getValues(), address: initialAddress });
    }
  });

  const handleNext = async (currentStepFields: (keyof FormValues)[]) => {
    const isValid = await form.trigger(currentStepFields);
    if (isValid) setStep((s) => s + 1);
  };

  const handleBack = () => setStep((s) => s - 1);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    
    const newFiles = Array.from(e.target.files);
    if (photos.length + newFiles.length > 15) {
      toast({ title: "Too many photos", description: "You can upload up to 15 photos.", variant: "destructive" });
      return;
    }
    
    setPhotos([...photos, ...newFiles]);
    setIsUploading(true);
    
    const newKeys: string[] = [];
    
    for (const file of newFiles) {
      try {
        const mimeType = file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp" 
          ? (file.type as "image/jpeg" | "image/png" | "image/webp") 
          : "image/jpeg";
          
        const { uploadUrl, objectKey } = await getUploadUrl.mutateAsync({
          data: { filename: file.name, mimeType }
        });
        
        // Try to upload to R2 (will fail in dev if no R2 setup, but we still keep the key)
        try {
          await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        } catch (err) {
          console.warn("Upload failed (likely dev environment)", err);
        }
        
        newKeys.push(objectKey);
      } catch (err) {
        toast({ title: "Upload warning", description: "Some photos couldn't be processed. We'll proceed anyway." });
      }
    }
    
    setPhotoKeys([...photoKeys, ...newKeys]);
    setIsUploading(false);
  };

  const removePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index));
    setPhotoKeys(photoKeys.filter((_, i) => i !== index));
  };

  const onSubmit = (data: FormValues) => {
    submitInquiry.mutate({
      data: {
        ...data,
        photoKeys,
        source: "website",
        utmSource: sessionStorage.getItem("utm_source") || null,
        utmMedium: sessionStorage.getItem("utm_medium") || null,
        utmCampaign: sessionStorage.getItem("utm_campaign") || null,
      }
    }, {
      onSuccess: (res) => {
        setSuccessData({ inquiryNumber: res.inquiryNumber, firstName: res.firstName });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to submit inquiry. Please try again.", variant: "destructive" });
      }
    });
  };

  const isPending = submitInquiry.isPending;

  return (
    <Dialog open={open} onOpenChange={(val) => {
      onOpenChange(val);
      if (!val) setTimeout(() => {
        setStep(1);
        setSuccessData(null);
        setPhotos([]);
        setPhotoKeys([]);
        form.reset();
      }, 300);
    }}>
      <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden bg-background">
        {successData ? (
          <div className="p-10 flex flex-col items-center justify-center text-center space-y-6">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-primary" />
            </div>
            <h2 className="font-serif text-3xl font-bold">Thank You{successData.firstName ? `, ${successData.firstName}` : ''}.</h2>
            <p className="text-muted-foreground text-lg max-w-md">
              We've received your property information. A member of the Rehman INC team will review your submission and contact you shortly.
            </p>
            <div className="bg-muted p-4 rounded-md w-full max-w-sm mt-4 border border-border">
              <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Your Reference</p>
              <p className="text-xl font-bold">{successData.inquiryNumber}</p>
            </div>
            <Button onClick={() => onOpenChange(false)} className="w-full max-w-sm mt-8 py-6">
              Close
            </Button>
          </div>
        ) : (
          <>
            <div className="px-6 py-4 bg-muted/50 border-b border-border flex justify-between items-center">
              <h3 className="font-serif font-semibold text-lg">Get Your Cash Offer</h3>
              <div className="text-sm text-muted-foreground font-medium">Step {step} of 4</div>
            </div>
            <Progress value={(step / 4) * 100} className="h-1 rounded-none bg-border" />
            
            <div className="p-6 md:p-8 overflow-y-auto max-h-[75vh]">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  
                  {/* STEP 1: PROPERTY */}
                  {step === 1 && (
                    <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
                      <h4 className="text-2xl font-serif font-bold text-foreground mb-6">Property Location</h4>
                      
                      <FormField
                        control={form.control}
                        name="address"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-base">Street Address *</FormLabel>
                            <FormControl>
                              <Input placeholder="123 Main St" className="h-12 text-base" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="city"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-base">City *</FormLabel>
                              <FormControl>
                                <Input className="h-12 text-base" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="state"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-base">State *</FormLabel>
                              <FormControl>
                                <Input placeholder="NY" className="h-12 text-base" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="zip"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-base">ZIP Code *</FormLabel>
                              <FormControl>
                                <Input className="h-12 text-base" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="propertyType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-base">Property Type</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger className="h-12 text-base">
                                    <SelectValue placeholder="Select type" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="single_family">Single Family</SelectItem>
                                  <SelectItem value="multi_family">Multi-Family</SelectItem>
                                  <SelectItem value="condo">Condo</SelectItem>
                                  <SelectItem value="townhouse">Townhouse</SelectItem>
                                  <SelectItem value="land">Land</SelectItem>
                                  <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <div className="pt-4 flex justify-end">
                        <Button type="button" size="lg" className="w-full md:w-auto h-12 px-8" onClick={() => handleNext(['address', 'city', 'state', 'zip', 'propertyType'])}>
                          Continue <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  {/* STEP 2: PROPERTY DETAILS */}
                  {step === 2 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                      <h4 className="text-2xl font-serif font-bold text-foreground mb-4">Property Details</h4>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="bedrooms"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Bedrooms</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger className="h-11">
                                    <SelectValue placeholder="Select" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {["1", "2", "3", "4", "5", "6+"].map(n => (
                                    <SelectItem key={n} value={n}>{n}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="bathrooms"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Bathrooms</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger className="h-11">
                                    <SelectValue placeholder="Select" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {["1", "1.5", "2", "2.5", "3", "4+"].map(n => (
                                    <SelectItem key={n} value={n}>{n}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="squareFootage"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Square Footage</FormLabel>
                              <FormControl>
                                <Input type="number" className="h-11" placeholder="e.g. 1500" {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="occupied"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Currently Occupied?</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger className="h-11">
                                    <SelectValue placeholder="Select" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="yes">Yes</SelectItem>
                                  <SelectItem value="no">No</SelectItem>
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="propertyCondition"
                        render={({ field }) => (
                          <FormItem className="space-y-3">
                            <FormLabel>Property Condition</FormLabel>
                            <FormControl>
                              <RadioGroup
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                                className="grid grid-cols-1 md:grid-cols-2 gap-3"
                              >
                                {[
                                  { val: "excellent", label: "Excellent" },
                                  { val: "good", label: "Good" },
                                  { val: "needs_some_work", label: "Needs Some Work" },
                                  { val: "needs_major_repairs", label: "Needs Major Repairs" }
                                ].map((opt) => (
                                  <FormItem key={opt.val} className="flex items-center space-x-3 space-y-0 border border-border rounded-md p-4 cursor-pointer hover:bg-muted/50 transition-colors [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5">
                                    <FormControl>
                                      <RadioGroupItem value={opt.val} />
                                    </FormControl>
                                    <FormLabel className="font-normal cursor-pointer w-full text-base">
                                      {opt.label}
                                    </FormLabel>
                                  </FormItem>
                                ))}
                              </RadioGroup>
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="sellingTimeline"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>How soon are you looking to sell?</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger className="h-11">
                                  <SelectValue placeholder="Select timeline" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="asap">ASAP</SelectItem>
                                <SelectItem value="within_30_days">Within 30 Days</SelectItem>
                                <SelectItem value="one_to_three_months">1-3 Months</SelectItem>
                                <SelectItem value="three_to_six_months">3-6 Months</SelectItem>
                                <SelectItem value="just_exploring">Just Exploring</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />
                      
                      <div className="pt-4 flex flex-col md:flex-row gap-3 md:justify-between">
                        <Button type="button" variant="outline" size="lg" className="h-12" onClick={handleBack}>
                          <ArrowLeft className="mr-2 h-4 w-4" /> Back
                        </Button>
                        <Button type="button" size="lg" className="h-12 md:px-8" onClick={() => handleNext(['bedrooms', 'bathrooms', 'squareFootage', 'occupied', 'propertyCondition', 'sellingTimeline'])}>
                          Continue <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* STEP 3: PHOTOS */}
                  {step === 3 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                      <div>
                        <h4 className="text-2xl font-serif font-bold text-foreground">Show Us The Property</h4>
                        <p className="text-muted-foreground mt-2">Property photos can help our team better understand the condition.</p>
                      </div>
                      
                      <div className="bg-muted border-2 border-dashed border-border rounded-lg p-8 flex flex-col items-center justify-center text-center">
                        <div className="bg-background rounded-full p-4 mb-4 shadow-sm">
                          <UploadCloud className="w-8 h-8 text-primary" />
                        </div>
                        <h5 className="font-semibold text-lg mb-2">Upload Photos (Optional)</h5>
                        <p className="text-sm text-muted-foreground mb-6 max-w-xs">
                          Drag and drop or click to select files. JPG, PNG, WEBP. Max 15 images.
                        </p>
                        <div className="relative">
                          <Button type="button" variant="secondary" disabled={isUploading}>
                            {isUploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...</> : 'Browse Files'}
                          </Button>
                          <input 
                            type="file" 
                            multiple 
                            accept="image/jpeg, image/png, image/webp" 
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed" 
                            onChange={handlePhotoUpload}
                            disabled={isUploading}
                          />
                        </div>
                      </div>

                      {photos.length > 0 && (
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mt-4">
                          {photos.map((photo, i) => (
                            <div key={i} className="relative aspect-square rounded-md overflow-hidden bg-muted group">
                              <img src={URL.createObjectURL(photo)} alt="preview" className="object-cover w-full h-full" />
                              <button 
                                type="button" 
                                onClick={() => removePhoto(i)}
                                className="absolute top-1 right-1 bg-background/80 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="w-4 h-4 text-foreground" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="bg-primary/5 border border-primary/20 rounded-md p-4 flex items-start gap-3">
                        <div className="text-primary mt-0.5">ℹ️</div>
                        <p className="text-sm"><strong>Photos are completely optional.</strong> You can submit your property without uploading any images and we will still process your cash offer request.</p>
                      </div>
                      
                      <div className="pt-4 flex flex-col md:flex-row gap-3 md:justify-between">
                        <Button type="button" variant="outline" size="lg" className="h-12" onClick={handleBack}>
                          <ArrowLeft className="mr-2 h-4 w-4" /> Back
                        </Button>
                        <Button type="button" size="lg" className="h-12 md:px-8" onClick={() => setStep(4)} disabled={isUploading}>
                          Continue <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* STEP 4: CONTACT */}
                  {step === 4 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                      <h4 className="text-2xl font-serif font-bold text-foreground mb-6">Where Should We Contact You?</h4>
                      
                      <FormField
                        control={form.control}
                        name="fullName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-base">Full Name *</FormLabel>
                            <FormControl>
                              <Input className="h-12 text-base" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-base">Email Address *</FormLabel>
                              <FormControl>
                                <Input type="email" className="h-12 text-base" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="phone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-base">Phone Number *</FormLabel>
                              <FormControl>
                                <Input type="tel" className="h-12 text-base" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <FormField
                        control={form.control}
                        name="preferredContact"
                        render={({ field }) => (
                          <FormItem className="space-y-3 pt-2">
                            <FormLabel className="text-base">Preferred Contact Method *</FormLabel>
                            <FormControl>
                              <RadioGroup
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                                className="flex gap-4"
                              >
                                {["Call", "Text", "Email"].map((method) => (
                                  <FormItem key={method} className="flex items-center space-x-2 space-y-0">
                                    <FormControl>
                                      <RadioGroupItem value={method.toLowerCase()} />
                                    </FormControl>
                                    <FormLabel className="font-normal text-base">{method}</FormLabel>
                                  </FormItem>
                                ))}
                              </RadioGroup>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="contactConsent"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0 pt-4 p-4 border border-border rounded-md bg-muted/30">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                className="mt-1"
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel className="text-sm font-normal text-muted-foreground cursor-pointer">
                                I agree to be contacted by Rehman INC regarding this property. I understand that submitting this information creates no obligation to sell.
                              </FormLabel>
                              <FormMessage />
                            </div>
                          </FormItem>
                        )}
                      />
                      
                      <div className="pt-6 flex flex-col md:flex-row gap-3 md:justify-between border-t border-border">
                        <Button type="button" variant="outline" size="lg" className="h-12" onClick={handleBack} disabled={isPending}>
                          <ArrowLeft className="mr-2 h-4 w-4" /> Back
                        </Button>
                        <Button type="submit" size="lg" className="h-12 md:px-8 text-base shadow-lg" disabled={isPending}>
                          {isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</> : "Submit My Property"}
                        </Button>
                      </div>
                    </div>
                  )}
                  
                </form>
              </Form>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
