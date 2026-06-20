import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Zap, Loader2 } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export default function Login() {
  const [isLoading, setIsLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: z.infer<typeof loginSchema>) => {
    setIsLoading(true);
    const { error, data } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });
    setIsLoading(false);

    if (error) {
      let msg = error.message;
      if (msg.includes('Email not confirmed')) {
        msg = 'Please check your email and click the confirmation link first.';
      } else if (msg.includes('Invalid login credentials')) {
        msg = 'Wrong email or password. Please try again.';
      }
      toast({ title: "Login failed", description: msg, variant: "destructive" });
      return;
    }

    if (data.session) {
      // Ensure profile row exists (upsert is safe — no-op if already there)
      const user = data.session.user;
      await supabase.from('profiles').upsert({
        id: user.id,
        email: user.email!,
        full_name: user.user_metadata?.full_name || user.email!.split('@')[0],
        username: user.user_metadata?.username || user.email!.split('@')[0],
        phone: user.user_metadata?.phone || '',
        address: user.user_metadata?.address || '',
        wallet_balance: 0,
      }, { onConflict: 'id', ignoreDuplicates: true });

      if (values.email === 'daramolapeter98@gmail.com') {
        setLocation('/admin/dashboard');
      } else {
        setLocation('/dashboard');
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md flex flex-col items-center">
        <div className="h-12 w-12 rounded-lg bg-primary flex items-center justify-center mb-4">
          <Zap className="h-7 w-7 text-white" />
        </div>
        <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900">
          CheapDataHub
        </h2>
        <p className="mt-1 text-gray-500">Sign in to your account</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  {...form.register("email")}
                  className={`h-12 ${form.formState.errors.email ? "border-destructive" : ""}`}
                  placeholder="you@example.com"
                />
                {form.formState.errors.email && (
                  <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  {...form.register("password")}
                  className={`h-12 ${form.formState.errors.password ? "border-destructive" : ""}`}
                />
                {form.formState.errors.password && (
                  <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
                )}
              </div>
              <Button type="submit" className="w-full h-12 text-base" disabled={isLoading}>
                {isLoading ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Signing in...</> : "Sign in"}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex justify-center border-t p-4">
            <p className="text-sm text-gray-600">
              Don't have an account?{" "}
              <Link href="/register">
                <a className="font-semibold text-primary hover:underline">Register</a>
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
