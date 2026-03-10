import { trpc } from "@/lib/trpc";
import { useForm } from "react-hook-form";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, Shield, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";

type FormData = {
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  gender?: string;
  pronouns?: string;
  email?: string;
  phone?: string;
  diagnosis?: string;
  treatmentGoals?: string;
  notes?: string;
  consentSigned: boolean;
  hipaaAcknowledged: boolean;
};

export default function NewClient() {
  const [, navigate] = useLocation();
  const createClient = trpc.clients.create.useMutation({
    onSuccess: (data) => {
      toast.success("Client created successfully");
      navigate(`/clients/${data.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    defaultValues: { consentSigned: false, hipaaAcknowledged: false },
  });

  const consentSigned = watch("consentSigned");
  const hipaaAcknowledged = watch("hipaaAcknowledged");

  const onSubmit = (data: FormData) => {
    if (!data.firstName || !data.lastName) return;
    createClient.mutate(data);
  };

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/clients">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">New Client</h1>
          <p className="text-muted-foreground text-sm">Create a new client profile</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Basic Info */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Basic Information</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">First Name *</Label>
                <Input id="firstName" {...register("firstName")} placeholder="Jane" />
                {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input id="lastName" {...register("lastName")} placeholder="Smith" />
                {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="dateOfBirth">Date of Birth</Label>
                <Input id="dateOfBirth" type="date" {...register("dateOfBirth")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gender">Gender</Label>
                <Input id="gender" {...register("gender")} placeholder="e.g., Female" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="pronouns">Pronouns</Label>
                <Input id="pronouns" {...register("pronouns")} placeholder="e.g., she/her" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" {...register("phone")} placeholder="(555) 000-0000" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register("email")} placeholder="jane@example.com" />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
          </CardContent>
        </Card>

        {/* Clinical Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Clinical Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="diagnosis">Diagnosis / Presenting Concern</Label>
              <Input id="diagnosis" {...register("diagnosis")} placeholder="e.g., Major Depressive Disorder, Anxiety" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="treatmentGoals">Treatment Goals</Label>
              <Textarea
                id="treatmentGoals"
                {...register("treatmentGoals")}
                placeholder="Describe the client's treatment goals..."
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Additional Notes</Label>
              <Textarea
                id="notes"
                {...register("notes")}
                placeholder="Any additional clinical notes..."
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Consent */}
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-600" />
              <CardTitle className="text-base text-blue-800">Consent & HIPAA</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3">
              <Checkbox
                id="consentSigned"
                checked={consentSigned}
                onCheckedChange={(v) => setValue("consentSigned", !!v)}
              />
              <div>
                <Label htmlFor="consentSigned" className="cursor-pointer font-medium">
                  Informed Consent Signed
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Client has signed informed consent for audio recording and emotion analysis
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Checkbox
                id="hipaaAcknowledged"
                checked={hipaaAcknowledged}
                onCheckedChange={(v) => setValue("hipaaAcknowledged", !!v)}
              />
              <div>
                <Label htmlFor="hipaaAcknowledged" className="cursor-pointer font-medium">
                  HIPAA Authorization Acknowledged
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Client has been informed of HIPAA rights and data handling practices
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3 pb-4">
          <Link href="/clients" className="flex-1">
            <Button type="button" variant="outline" className="w-full">Cancel</Button>
          </Link>
          <Button type="submit" className="flex-1" disabled={createClient.isPending}>
            {createClient.isPending ? "Creating..." : "Create Client"}
          </Button>
        </div>
      </form>
    </div>
  );
}
