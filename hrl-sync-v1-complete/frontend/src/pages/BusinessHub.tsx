import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Briefcase, Radio, Users, Plus } from "lucide-react";

export default function BusinessHub() {
    return (
        <Layout>
            <div className="space-y-6">
                <div>
                    <h1 className="hrl-title text-3xl text-foreground">Business Hub</h1>
                    <p className="text-muted-foreground mt-1">Manage B2B Clients, Agencies, and White Label Channels.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* WHITE LABEL CHANNELS */}
                    <Card className="bg-card/50 border-white/5 overflow-hidden group hover:border-red-500/20 transition-all">
                        <CardHeader className="pb-3">
                            <div className="w-10 h-10 rounded bg-red-500/10 flex items-center justify-center mb-2">
                                <Radio className="w-5 h-5 text-red-500" />
                            </div>
                            <CardTitle>White Label Channels</CardTitle>
                            <CardDescription>Custom branded music streams for your clients.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button variant="outline" className="w-full gap-2 group-hover:bg-red-500 group-hover:text-white transition-colors">
                                <Plus className="w-4 h-4" /> Create Channel
                            </Button>
                        </CardContent>
                    </Card>

                    {/* AGENCIES CRM */}
                    <Card className="bg-card/50 border-white/5 overflow-hidden group hover:border-blue-500/20 transition-all">
                        <CardHeader className="pb-3">
                            <div className="w-10 h-10 rounded bg-blue-500/10 flex items-center justify-center mb-2">
                                <Users className="w-5 h-5 text-blue-500" />
                            </div>
                            <CardTitle>Agencies & Partners</CardTitle>
                            <CardDescription>Industry database of record labels and agencies.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button variant="outline" className="w-full gap-2 hover:bg-blue-500 hover:text-white transition-colors">
                                Open Database
                            </Button>
                        </CardContent>
                    </Card>

                    {/* B2B CLIENTS */}
                    <Card className="bg-card/50 border-white/5 overflow-hidden group hover:border-green-500/20 transition-all">
                        <CardHeader className="pb-3">
                            <div className="w-10 h-10 rounded bg-green-500/10 flex items-center justify-center mb-2">
                                <Briefcase className="w-5 h-5 text-green-500" />
                            </div>
                            <CardTitle>Corporate Clients</CardTitle>
                            <CardDescription>Monitor your B2B enterprise subscriptions.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button variant="outline" className="w-full gap-2 hover:bg-green-500 hover:text-white transition-colors">
                                Manage Clients
                            </Button>
                        </CardContent>
                    </Card>
                </div>

                <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-6 mt-8">
                    <h2 className="text-xl font-semibold mb-2">Premium Pro Roadmap</h2>
                    <p className="text-sm text-muted-foreground mb-4">You are running the Modernized v2.0 Premium Hub. AI-powered features for auto-curation are now available in the Library.</p>
                    <div className="flex gap-4">
                        <div className="px-3 py-1 bg-red-500/10 text-red-500 text-xs rounded border border-red-500/20 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            AI Integration (Groq/Gemini) Active
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
}
