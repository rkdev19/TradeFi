"use client"

import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { 
  Zap, 
  Shield, 
  Layers, 
  ArrowRight, 
  Play, 
  Code, 
  Globe,
  Sparkles,
  ChevronDown,
  Mouse,
  Star,
  Rocket
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useWallet } from "@txnlab/use-wallet-react"
import ConnectWallet from "../components/ConnectWallet"



const Index = () => {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const features = [
    {
      icon: Shield,
      title: "Quantum Security",
      description: "Military-grade encryption with quantum-resistant algorithms",
      glow: "shadow-[0_0_40px_rgba(139,92,246,0.3)]"
    },
    {
      icon: Zap,
      title: "Lightning Speed",
      description: "Sub-second transaction finality on Layer 1",
      glow: "shadow-[0_0_40px_rgba(168,85,247,0.3)]"
    },
    {
      icon: Layers,
      title: "Multi-Chain",
      description: "Seamless interoperability across all blockchains",
      glow: "shadow-[0_0_40px_rgba(192,132,252,0.3)]"
    }
  ];
  const [openWalletModal, setOpenWalletModal] = useState(false)
  const { activeAddress } = useWallet()

  const toggleWalletModal = () => {
    setOpenWalletModal(!openWalletModal)
  }

  const formatAddress = (addr: string) => {
    if (!addr) return ""
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Advanced Background Grid */}
      <div className="absolute inset-0 bg-grid-pattern opacity-[0.02]" />
      
      {/* Dynamic Mesh Gradients */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-violet-600/10 via-transparent to-fuchsia-600/10 animate-mesh-1" />
        <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-bl from-cyan-600/10 via-transparent to-purple-600/10 animate-mesh-2" />
        <div className="absolute bottom-0 left-0 w-full h-full bg-gradient-to-tr from-blue-600/10 via-transparent to-pink-600/10 animate-mesh-3" />
      </div>

      {/* Floating Orbs with Blur */}
      <div className="absolute top-20 left-20 w-96 h-96 bg-gradient-to-br from-violet-500/20 to-purple-500/20 rounded-full blur-3xl animate-float-slow" />
      <div className="absolute top-40 right-10 w-80 h-80 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-full blur-3xl animate-float-medium" />
      <div className="absolute bottom-20 left-1/3 w-72 h-72 bg-gradient-to-br from-fuchsia-500/20 to-pink-500/20 rounded-full blur-3xl animate-float-fast" />

      {/* Custom Cursor */}
      <div 
        className="fixed w-2 h-2 bg-violet-400 rounded-full pointer-events-none z-50 mix-blend-difference transition-all duration-100"
        style={{ left: mousePos.x - 4, top: mousePos.y - 4 }}
      />

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-40 backdrop-blur-xl bg-background/80 border-b border-white/5">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="relative group">
                <div className="w-12 h-12 bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 rounded-2xl flex items-center justify-center shadow-lg group-hover:shadow-violet-500/25 transition-all duration-300">
                  <Globe className="h-6 w-6 text-white" />
                </div>
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full animate-pulse" />
              </div>
              <div>
                 <span 
                    className="text-3xl font-bold"
                    style={{
                      background: 'linear-gradient(to right, rgb(167 139 250), rgb(196 181 253), rgb(232 121 249))',
                      WebkitBackgroundClip: 'text',
                      backgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      color: 'transparent',
                      display: 'inline-block'
                    }}
                  >
                    Tenderfi
                  </span>
                <div className="text-xs text-muted-foreground font-mono">Web3 Procurement</div>
              </div>
            </div>
            
            <div className="hidden md:flex items-center space-x-8">
              <a href="#features" className="text-muted-foreground hover:text-white transition-colors duration-300 text-sm font-medium">Features</a>
              <a href="#demo" className="text-muted-foreground hover:text-white transition-colors duration-300 text-sm font-medium">Demo</a>
              <Button 
                onClick={toggleWalletModal}
                className="bg-black hover:bg-gray-900 text-white border border-white/10 hover:border-white/20 transition-all duration-300"
                data-test-id="connect-wallet"
              >
                {activeAddress ? formatAddress(activeAddress) : "Connect Wallet"}
              </Button>

            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 relative z-10">
        <div className="container mx-auto text-center max-w-7xl">
          {/* Hero Badge */}
          <div className="flex justify-center mb-8">
            <Badge className="backdrop-blur-xl bg-violet-500/10 border border-violet-500/20 text-violet-300 px-6 py-3 text-sm font-medium rounded-full hover:bg-violet-500/20 transition-all duration-300 group">
              <Star className="h-4 w-4 mr-2 group-hover:rotate-12 transition-transform duration-300" />
              Next-Gen Blockchain Infrastructure
              <Sparkles className="h-4 w-4 ml-2 group-hover:scale-110 transition-transform duration-300" />
            </Badge>
          </div>

          {/* Main Headline */}
          <div className="mb-12">
            <h1 className="text-7xl md:text-8xl lg:text-9xl font-black mb-8 leading-[0.85] tracking-tighter">
              <span className="block text-white/90 mb-4 animate-slide-down">FUTURE OF</span>
              <span 
                className="block mb-4 animate-slide-up"
                style={{
                  background: 'linear-gradient(to right, rgb(167 139 250), rgb(196 181 253), rgb(232 121 249))',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  color: 'transparent',
                  display: 'block'
                }}
              >
                PROCUREMENT
              </span>
              <span className="block text-white/90 animate-slide-down-delay">IS HERE</span>
            </h1>
          </div>

          {/* Subtitle */}
          <div className="mb-16 animate-fade-in-delay">
            <p className="text-xl md:text-2xl text-gray-400 mb-8 max-w-5xl mx-auto leading-relaxed font-light">
              Revolutionary quantum-secured blockchain platform transforming 
              <span className="text-violet-400 font-semibold"> government procurement</span> with 
              <span className="text-purple-400 font-semibold"> zero-knowledge proofs</span> and 
              <span className="text-fuchsia-400 font-semibold"> AI-powered smart contracts</span>
            </p>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-6 justify-center mb-20 animate-scale-in-delay">
            <Button className="bg-black hover:bg-gray-900 text-white px-12 py-6 text-lg font-semibold rounded-2xl border border-white/10 hover:border-white/20 group transition-all duration-300 shadow-lg hover:shadow-xl">
              <Rocket className="h-6 w-6 mr-3 group-hover:scale-110 group-hover:-rotate-12 transition-all duration-300" />
              Launch Platform
              <ArrowRight className="h-6 w-6 ml-3 group-hover:translate-x-1 transition-transform duration-300" />
            </Button>
            <Button variant="outline" className="backdrop-blur-xl bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-white/20 px-12 py-6 text-lg font-semibold rounded-2xl group transition-all duration-300">
              <Code className="h-6 w-6 mr-3 group-hover:scale-110 transition-transform duration-300" />
              View Documentation
            </Button>
          </div>

          {/* Scroll Indicator */}
          <div className="animate-bounce-slow">
            <ChevronDown className="h-8 w-8 text-gray-500 mx-auto opacity-60" />
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 px-6 relative z-10">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
             <h2 
                  className="text-5xl md:text-6xl font-bold mb-6"
                  style={{
                    background: 'linear-gradient(to right, rgb(167 139 250), rgb(196 181 253), rgb(232 121 249))',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    color: 'transparent',
                    display: 'inline-block'
                  }}
                >
                  Quantum-Powered Features
                </h2>
            <p className="text-xl text-gray-400 max-w-3xl mx-auto">
              Built with cutting-edge technology for the next decade of Web3 innovation
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="backdrop-blur-xl bg-white/[0.02] border border-white/10 hover:border-white/20 rounded-3xl group transition-all duration-500 hover:scale-105">
                <CardContent className="p-8 text-center">
                  <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-3xl flex items-center justify-center group-hover:scale-110 group-hover:rotate-6 transition-all duration-500 shadow-lg">
                    <feature.icon className="h-10 w-10 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4 text-white">{feature.title}</h3>
                  <p className="text-gray-400 leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section id="demo" className="py-20 px-6 relative z-10">
        <div className="container mx-auto max-w-5xl text-center">
          <div className="backdrop-blur-xl bg-white/[0.02] border border-white/10 rounded-3xl p-12 hover:border-white/20 transition-all duration-500 group">
             <h3 
              className="text-4xl md:text-5xl font-bold mb-6"
              style={{
                background: 'linear-gradient(to right, rgb(167 139 250), rgb(196 181 253), rgb(232 121 249))',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                color: 'transparent',
                display: 'inline-block'
              }}
            >
              Ready to Transform Procurement?
            </h3>
            <p className="text-xl text-gray-400 mb-10 leading-relaxed max-w-3xl mx-auto">
              Join the quantum revolution in public sector blockchain technology and experience the future of transparent governance
            </p>
            <div className="flex flex-col sm:flex-row gap-6 justify-center">
              <Button className="bg-black hover:bg-gray-900 text-white px-10 py-4 text-lg font-semibold rounded-2xl border border-white/10 hover:border-white/20 group transition-all duration-300">
                Start Building
                <ArrowRight className="h-5 w-5 ml-3 group-hover:translate-x-1 transition-transform duration-300" />
              </Button>
              <Button variant="outline" className="backdrop-blur-xl bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-white/20 px-10 py-4 text-lg font-semibold rounded-2xl group transition-all duration-300">
                <Mouse className="h-5 w-5 mr-3 group-hover:scale-110 transition-transform duration-300" />
                Interactive Demo
              </Button>
            </div>
          </div>
        </div>
      </section>
 <ConnectWallet openModal={openWalletModal} closeModal={toggleWalletModal} />
      {/* Footer */}
      <footer className="py-12 px-6 border-t border-white/5 relative z-10 backdrop-blur-xl">
        <div className="container mx-auto text-center">
          <div className="flex items-center justify-center space-x-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl flex items-center justify-center shadow-lg">
              <Globe className="h-5 w-5 text-white" />
            </div>
            <span 
              className="text-2xl font-bold"
              style={{
                background: 'linear-gradient(to right, rgb(167 139 250), rgb(196 181 253), rgb(232 121 249))',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                color: 'transparent',
                display: 'inline-block'
              }}
            >
              Tenderfi
            </span>
          </div>
          <p className="text-gray-500 mb-6 font-mono text-sm">
            {"// Building the future of decentralized procurement"}
          </p>
          <div className="flex justify-center space-x-8 text-sm text-gray-400">
            <a href="#" className="hover:text-violet-400 transition-colors duration-300">Privacy</a>
            <a href="#" className="hover:text-violet-400 transition-colors duration-300">Terms</a>
            <a href="#" className="hover:text-violet-400 transition-colors duration-300">API</a>
            <a href="#" className="hover:text-violet-400 transition-colors duration-300">GitHub</a>
          </div>
          <div className="mt-8 pt-8 border-t border-white/5 text-xs text-gray-500 font-mono">
            <p>© 2025 Tenderfi Protocol. Quantum-secured by design.</p>
          </div>
        </div>
      </footer>
    </div>
    
   
   
  );
 
};

export default Index;
