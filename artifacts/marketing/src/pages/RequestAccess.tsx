import React, { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2 } from "lucide-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const requestSchema = z.object({
  name: z.string().min(2, "Full name is required."),
  email: z.string().email("Please enter a valid work email address."),
  firm: z.string().min(2, "Firm name is required."),
  role: z.string().min(2, "Role/Title is required."),
  aum: z.string().min(1, "Please select an AUM range."),
  message: z.string().optional()
});

export default function RequestAccess() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<z.infer<typeof requestSchema>>({
    resolver: zodResolver(requestSchema),
    defaultValues: {
      name: "",
      email: "",
      firm: "",
      role: "",
      aum: "",
      message: ""
    }
  });

  async function onSubmit(values: z.infer<typeof requestSchema>) {
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Something went wrong. Please try again.");
      }
      setSubmitted(true);
    } catch (err: unknown) {
      setServerError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <main className="min-h-screen bg-background pt-32 pb-24 px-6 flex items-center justify-center">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-card border border-border p-10 rounded-2xl text-center shadow-xl"
        >
          <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
          </div>
          <h2 className="text-3xl font-display font-bold mb-4">Request Received</h2>
          <p className="text-muted-foreground mb-8">
            Thank you for your interest in Finsyt. Our team will review your application and reach out shortly to schedule a personalized demo.
          </p>
          <Link href="/">
            <Button className="w-full">Return Home</Button>
          </Link>
        </motion.div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background pt-32 pb-24 px-6">
      <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-16">
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col justify-center"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6 border border-primary/20 w-fit">
            Early Access
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-6">
            Request platform access.
          </h1>
          <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
            Finsyt is currently onboarding institutional clients in cohorts to ensure white-glove service and optimal model performance.
          </p>
          <div className="space-y-6 text-sm">
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0 font-bold font-display">1</div>
              <div>
                <div className="font-bold text-foreground mb-1">Submit Request</div>
                <div className="text-muted-foreground">Tell us about your firm and specific coverage needs.</div>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0 font-bold font-display">2</div>
              <div>
                <div className="font-bold text-foreground mb-1">Personalized Demo</div>
                <div className="text-muted-foreground">We'll show you Finsyt running live on your target companies.</div>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0 font-bold font-display">3</div>
              <div>
                <div className="font-bold text-foreground mb-1">Onboarding</div>
                <div className="text-muted-foreground">Secure workspace provisioning and team training.</div>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card border border-border rounded-2xl p-8 shadow-xl"
        >
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Jane Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Work Email</FormLabel>
                    <FormControl>
                      <Input placeholder="jane@fund.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-5">
                <FormField
                  control={form.control}
                  name="firm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Firm Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Acme Capital" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role / Title</FormLabel>
                      <FormControl>
                        <Input placeholder="Portfolio Manager" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="aum"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Firm AUM</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select range" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="under-100m">&lt; $100M</SelectItem>
                        <SelectItem value="100m-500m">$100M - $500M</SelectItem>
                        <SelectItem value="500m-1b">$500M - $1B</SelectItem>
                        <SelectItem value="1b-5b">$1B - $5B</SelectItem>
                        <SelectItem value="over-5b">&gt; $5B</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="message"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Specific use cases or questions (Optional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="We are looking to analyze..." 
                        className="resize-none h-24" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {serverError && (
                <p className="text-sm text-destructive">{serverError}</p>
              )}

              <Button type="submit" className="w-full h-12 text-base mt-2" disabled={submitting}>
                {submitting ? "Submitting…" : "Submit Request"}
              </Button>
            </form>
          </Form>
        </motion.div>
      </div>
    </main>
  );
}
