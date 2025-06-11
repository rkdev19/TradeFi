import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { useWallet } from "@txnlab/use-wallet-react";
import ConnectWallet from "../components/ConnectWallet";
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

// Interface based on your AuctionX smart contract fields
interface AuctionTender {
  id: string;
  appId: number;
  assetId: number;
  assetName: string;
  assetImage: string;
  floorPrice: number; // in microAlgos
  highestBid: number; // in microAlgos
  highestBidder: string; // Account address
  creator: string; // Contract creator address
  description: string;
  endTime: Date;
  status: 'active' | 'ended' | 'accepted' | 'rejected';
  category: string;
  bidsCount: number;
}

interface WalletState {
  connected: boolean;
  address: string;
  provider: any;
}

const Tenders: React.FC = () => {

  const [openWalletModal, setOpenWalletModal] = useState(false)
  const { activeAddress } = useWallet()

  const toggleWalletModal = () => {
    setOpenWalletModal(!openWalletModal)
  }

  const formatAddress = (addr: string) => {
    if (!addr) return ""
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`
  }
  
  const [tenders, setTenders] = useState<AuctionTender[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTender, setSelectedTender] = useState<AuctionTender | null>(null);
  const [bidAmount, setBidAmount] = useState('');
  const [bidModalOpen, setBidModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newTenderForm, setNewTenderForm] = useState({
    assetId: '',
    assetName: '',
    assetImage: '',
    floorPrice: '',
    description: '',
    category: 'NFT',
    endTime: ''
  });
  const [wallet, setWallet] = useState<WalletState>({
    connected: false,
    address: '',
    provider: null
  });
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('ending-soon');

  // Fake tender data based on your contract structure
  const fakeTenders: AuctionTender[] = [
    {
      id: '1',
      appId: 123456,
      assetId: 789012,
      assetName: 'Port Infrastructure',
      assetImage: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400',
      floorPrice: 1000000, // 1 ALGO
      highestBid: 2500000, // 2.5 ALGO
      highestBidder: 'ABCD...XYZ',
      creator: 'CREATOR...123',
      description: 'Expansion and modernization of port facilities including container terminals etc',
      endTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: 'active',
      category: 'Infrastructure',
      bidsCount: 12
    },
    {
      id: '2',
      appId: 123457,
      assetId: 789013,
      assetName: 'Telemedicine Platform ',
      assetImage: 'https://images.unsplash.com/photo-1634973357973-f2ed2657db3c?w=400',
      floorPrice: 500000, // 0.5 ALGO
      highestBid: 1800000, // 1.8 ALGO
      highestBidder: 'EFGH...ABC',
      creator: 'CREATOR...456',
      description: 'Development and implementation of telemedicine solutions for remote healthcare delivery',
      endTime: new Date(Date.now() + 12 * 60 * 60 * 1000),
      status: 'active',
      category: 'Health Care',
      bidsCount: 8
    },
    {
      id: '3',
      appId: 123458,
      assetId: 789014,
      assetName: 'Digital India Platform',
      assetImage: 'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=400',
      floorPrice: 2000000, // 2 ALGO
      highestBid: 0, // No bids yet
      highestBidder: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ',
      creator: 'CREATOR...789',
      description: 'Development and maintenance of government digital platforms, e-governance solutions',
      endTime: new Date(Date.now() + 48 * 60 * 60 * 1000),
      status: 'active',
      category: 'It Servicesr',
      bidsCount: 0
    },
    {
      id: '4',
      appId: 123459,
      assetId: 789015,
      assetName: 'Over Bridge',
      assetImage: 'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=400',
      floorPrice: 3000000, // 3 ALGO
      highestBid: 4200000, // 4.2 ALGO
      highestBidder: 'IJKL...DEF',
      creator: 'CREATOR...012',
      description: 'Over Brifge for ABC Railway Crossing',
      endTime: new Date(Date.now() + 6 * 60 * 60 * 1000),
      status: 'active',
      category: 'Construction',
      bidsCount: 15
    }
  ];

  useEffect(() => {
    // Simulate loading with staggered animation
    setTimeout(() => {
      setTenders(fakeTenders);
      setLoading(false);
    }, 1200);

    // Simulate wallet connection
    setWallet({
      connected: true,
      address: 'ALGO...X9K2',
      provider: null
    });
  }, []);

  // Convert microAlgos to ALGO
  const microAlgosToAlgo = (microAlgos: number): string => {
    return (microAlgos / 1000000).toFixed(2);
  };

  // Format time remaining with color coding
  const getTimeRemaining = (endTime: Date): { text: string; urgent: boolean } => {
    const now = new Date();
    const diff = endTime.getTime() - now.getTime();

    if (diff <= 0) return { text: 'Ended', urgent: false };

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    const urgent = hours < 6;

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return { text: `${days}d ${hours % 24}h`, urgent: false };
    }

    return { text: `${hours}h ${minutes}m`, urgent };
  };

  // Filter and sort tenders
  const filteredAndSortedTenders = tenders
    .filter(tender => filter === 'all' || tender.category.toLowerCase() === filter.toLowerCase())
    .sort((a, b) => {
      switch (sortBy) {
        case 'ending-soon':
          return a.endTime.getTime() - b.endTime.getTime();
        case 'highest-bid':
          return b.highestBid - a.highestBid;
        case 'newest':
          return b.appId - a.appId;
        default:
          return 0;
      }
    });

  // Handle bid placement
  const handlePlaceBid = async (tender: AuctionTender) => {
    if (!wallet.connected) {
      alert('Please connect your wallet first');
      return;
    }

    setSelectedTender(tender);
    setBidModalOpen(true);
  };

  // Submit bid (integrate with AlgoKit)
  const submitBid = async () => {
    if (!selectedTender || !bidAmount) return;

    const bidInMicroAlgos = parseFloat(bidAmount) * 1000000;

    if (bidInMicroAlgos <= selectedTender.highestBid) {
      alert('Bid must be higher than current highest bid');
      return;
    }

    if (bidInMicroAlgos < selectedTender.floorPrice) {
      alert('Bid must be at least the floor price');
      return;
    }

    try {
      // AlgoKit integration placeholder
      console.log('Placing bid:', {
        appId: selectedTender.appId,
        bidAmount: bidInMicroAlgos,
        wallet: wallet.address
      });

      // Simulate successful bid
      setBidModalOpen(false);
      setBidAmount('');

      // Update tender state
      setTenders(prev => prev.map(t => 
        t.id === selectedTender.id 
          ? { ...t, highestBid: bidInMicroAlgos, highestBidder: wallet.address, bidsCount: t.bidsCount + 1 }
          : t
      ));
    } catch (error) {
      console.error('Error placing bid:', error);
    }
  };

  // Handle form input changes
  const handleFormChange = (field: string, value: string) => {
    setNewTenderForm(prev => ({ ...prev, [field]: value }));
  };

  // Submit new tender
  const submitNewTender = async () => {
    const { assetId, assetName, assetImage, floorPrice, description, category, endTime } = newTenderForm;

    if (!assetId || !assetName || !floorPrice || !description || !endTime) {
      alert('Please fill in all required fields');
      return;
    }

    const newTender: AuctionTender = {
      id: Date.now().toString(),
      appId: parseInt(assetId) + 1000,
      assetId: parseInt(assetId),
      assetName,
      assetImage: assetImage || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400',
      floorPrice: parseFloat(floorPrice) * 1000000, // Convert to microAlgos
      highestBid: 0,
      highestBidder: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ',
      creator: wallet.address,
      description,
      endTime: new Date(endTime),
      status: 'active',
      category,
      bidsCount: 0
    };

    try {
      // Add new tender to the list
      setTenders(prev => [...prev, newTender]);

      // Reset form and close modal
      setNewTenderForm({
        assetId: '',
        assetName: '',
        assetImage: '',
        floorPrice: '',
        description: '',
        category: 'NFT',
        endTime: ''
      });
      setCreateModalOpen(false);

      alert('Tender created successfully!');
    } catch (error) {
      console.error('Error creating tender:', error);
      alert('Error creating tender. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center relative overflow-hidden">
        {/* Animated Background */}
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-r from-violet-600/20 to-fuchsia-600/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gradient-to-r from-cyan-600/20 to-purple-600/20 rounded-full blur-3xl animate-pulse"></div>
        </div>

        <div className="text-center z-10">
          <div className="w-16 h-16 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mx-auto mb-8"></div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-fuchsia-400 bg-clip-text text-transparent mb-4">
            Loading Quantum Tenders
          </h2>
          <p className="text-white/60">Initializing secure blockchain connections...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Animated Background Mesh */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-r from-violet-600/10 to-transparent rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute top-3/4 right-1/4 w-96 h-96 bg-gradient-to-r from-fuchsia-600/10 to-transparent rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 left-1/2 w-96 h-96 bg-gradient-to-r from-cyan-600/10 to-transparent rounded-full blur-3xl animate-pulse"></div>
        </div>

        {/* Grid Pattern */}
        <div className="absolute inset-0 bg-grid-pattern opacity-20"></div>
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/10 backdrop-blur-xl bg-black/50">
        <div className="container mx-auto px-6 py-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
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
                <div className="text-xs text-muted-foreground font-mono">Web3 Smart Tenders</div>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <button 
                onClick={() => setCreateModalOpen(true)}
                className="bg-gradient-to-r from-purple-500 to-fuchsia-500 hover:from-purple-600 hover:to-fuchsia-600 px-6 py-3 rounded-xl font-semibold transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-purple-500/25"
              >
                + Create Tender
              </button>
              <Button 
                onClick={toggleWalletModal}
                className="bg-black hover:bg-gray-900 text-white border border-white/10 hover:border-white/20 transition-all duration-300"
                data-test-id="connect-wallet"
              >
                <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse shadow-lg shadow-green-400/50"></div>
                {activeAddress ? formatAddress(activeAddress) : "Connect Wallet"}
              </Button>
              
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 container mx-auto px-6 py-12">
        {/* Hero Section */}
        <div className="text-center mb-16">

          <h2 
            className="text-6xl font-black mb-6 leading-tight animate-slide-up"
            style={{
              background: 'linear-gradient(to right, rgb(255 255 255), rgb(196 181 253), rgb(240 171 252))',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              color: 'transparent',
              display: 'block'
            }}
          >
             Auction Tenders
          </h2>
          <p className="text-xl text-white/70 max-w-3xl mx-auto leading-relaxed">
            Experience the future of decentralized auctions with quantum-level security and lightning-fast transactions on Algorand blockchain.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col lg:flex-row justify-between items-center mb-12 space-y-6 lg:space-y-0">
          <div className="flex items-center space-x-6">
            <h3 className="text-2xl font-bold text-white">Active Tenders</h3>
            <div className="flex items-center space-x-2 bg-green-500/10 border border-green-500/20 rounded-full px-4 py-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-green-400">{tenders.length} Live</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4">
            <select 
              value={filter} 
              onChange={(e) => setFilter(e.target.value)}
              className="w-full bg-gray-900/90 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
            >
              <option value="all">All Categories</option>
              <option value="Infrastructure">Infrastructure</option>
              <option value="Construction">Construction</option>
              <option value="It Services">IT Services</option>
              <option value="Health Carer">Healthcare</option>
              
            </select>
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full bg-gray-900/90 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
            >
              <option value="ending-soon">Ending Soon</option>
              <option value="highest-bid">Highest Bid</option>
              <option value="newest">Newest First</option>
            </select>
          </div>
        </div>

        {/* Tenders Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {filteredAndSortedTenders.map((tender, index) => {
            const timeRemaining = getTimeRemaining(tender.endTime);
            return (
              <div 
                key={tender.id} 
                className={`group bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 transition-all duration-500 hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/10 animate-slide-up`}
                style={{ animationDelay: `${index * 150}ms` }}
              >
                <div className="relative overflow-hidden">
                  <img 
                    src={tender.assetImage} 
                    alt={tender.assetName}
                    className="w-full h-48 object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                  <div className="absolute top-4 left-4">
                    <span className="bg-purple-500/80 backdrop-blur-sm text-white text-xs font-bold px-3 py-1 rounded-full">
                      {tender.category}
                    </span>
                  </div>
                  <div className="absolute top-4 right-4">
                    <span className={`${timeRemaining.urgent ? 'bg-red-500/80 animate-pulse' : 'bg-green-500/80'} backdrop-blur-sm text-white text-xs font-bold px-3 py-1 rounded-full`}>
                      {timeRemaining.text}
                    </span>
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2 group-hover:text-purple-300 transition-colors duration-200">
                      {tender.assetName}
                    </h3>
                    <p className="text-white/60 text-sm line-clamp-2">
                      {tender.description}
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-white/60 text-sm">Floor Price</span>
                      <span className="text-white font-semibold">
                        {microAlgosToAlgo(tender.floorPrice)} ALGO
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-white/60 text-sm">Highest Bid</span>
                      <span className="text-fuchsia-400 font-bold text-lg">
                        {tender.highestBid > 0 ? `${microAlgosToAlgo(tender.highestBid)} ALGO` : 'No bids'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-white/60 text-sm">Total Bids</span>
                      <span className="text-purple-400 font-semibold">
                        {tender.bidsCount}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handlePlaceBid(tender)}
                    className="w-full bg-gradient-to-r from-purple-500 to-fuchsia-500 hover:from-purple-600 hover:to-fuchsia-600 text-white font-semibold py-3 rounded-xl transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-purple-500/25"
                  >
                    Place Bid
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Bid Modal */}
      {bidModalOpen && selectedTender && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl max-w-md w-full p-8 animate-scale-in">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-white">Place Your Bid</h3>
              <button 
                onClick={() => setBidModalOpen(false)}
                className="text-white/60 hover:text-white text-2xl transition-colors duration-200"
              >
                ×
              </button>
            </div>

            <div className="space-y-6">
              <div className="text-center">
                <img 
                  src={selectedTender.assetImage} 
                  alt={selectedTender.assetName}
                  className="w-24 h-24 rounded-2xl mx-auto mb-4 object-cover"
                />
                <h4 className="text-xl font-semibold text-white mb-2">{selectedTender.assetName}</h4>
                <p className="text-white/60 text-sm">{selectedTender.description}</p>
              </div>

              <div className="bg-white/5 rounded-xl p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-white/60">Current Highest Bid</span>
                  <span className="text-fuchsia-400 font-bold">
                    {selectedTender.highestBid > 0 ? `${microAlgosToAlgo(selectedTender.highestBid)} ALGO` : 'No bids'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Minimum Bid</span>
                  <span className="text-white font-semibold">
                    {microAlgosToAlgo(Math.max(selectedTender.highestBid + 100000, selectedTender.floorPrice))} ALGO
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-white font-medium mb-2">Your Bid Amount (ALGO)</label>
                <input
                  type="number"
                  step="0.01"
                  min={microAlgosToAlgo(Math.max(selectedTender.highestBid + 100000, selectedTender.floorPrice))}
                  value={bidAmount}
                  onChange={(e) => setBidAmount(e.target.value)}
                  className="w-full bg-white/5 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-3 text-white text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
                  placeholder="Enter bid amount"
                />
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => setBidModalOpen(false)}
                  className="flex-1 bg-white/10 hover:bg-white/20 text-white font-semibold py-3 rounded-xl transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={submitBid}
                  disabled={!bidAmount}
                  className="flex-1 bg-gradient-to-r from-purple-500 to-fuchsia-500 hover:from-purple-600 hover:to-fuchsia-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all duration-300 hover:scale-105"
                >
                  Confirm Bid
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Tender Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl max-w-lg w-full p-8 animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-white">Create New Tender</h3>
              <button 
                onClick={() => setCreateModalOpen(false)}
                className="text-white/60 hover:text-white text-2xl transition-colors duration-200"
              >
                ×
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-white font-medium mb-2">Asset ID *</label>
                <input
                  type="number"
                  value={newTenderForm.assetId}
                  onChange={(e) => handleFormChange('assetId', e.target.value)}
                  className="w-full bg-white/5 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
                  placeholder="Enter Asset ID"
                  required
                />
              </div>

              <div>
                <label className="block text-white font-medium mb-2">Asset Name *</label>
                <input
                  type="text"
                  value={newTenderForm.assetName}
                  onChange={(e) => handleFormChange('assetName', e.target.value)}
                  className="w-full bg-white/5 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
                  placeholder="Enter asset name"
                  required
                />
              </div>

              <div>
                <label className="block text-white font-medium mb-2">Asset Image URL</label>
                <input
                  type="url"
                  value={newTenderForm.assetImage}
                  onChange={(e) => handleFormChange('assetImage', e.target.value)}
                  className="w-full bg-white/5 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
                  placeholder="https://example.com/image.jpg (optional)"
                />
              </div>

              <div>
                <label className="block text-white font-medium mb-2">Floor Price (ALGO) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newTenderForm.floorPrice}
                  onChange={(e) => handleFormChange('floorPrice', e.target.value)}
                  className="w-full bg-white/5 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
                  placeholder="Enter minimum bid amount"
                  required
                />
              </div>

              <div>
                <label className="block text-white font-medium mb-2">Category *</label>
                <select
                  value={newTenderForm.category}
                  onChange={(e) => handleFormChange('category', e.target.value)}
                  className="w-full bg-gray-900/90 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
                  required
                >
                  <option value="Infrastructure" className="bg-gray-900 text-white">Infrastructure</option>
                  <option value="Construction" className="bg-gray-900 text-white">Construction</option>
                  <option value="IT Services" className="bg-gray-900 text-white">IT Services</option>
                  <option value="Healthcare" className="bg-gray-900 text-white">Healthcare</option>
                  
                </select>
              </div>

              <div>
                <label className="block text-white font-medium mb-2">Description *</label>
                <textarea
                  value={newTenderForm.description}
                  onChange={(e) => handleFormChange('description', e.target.value)}
                  className="w-full bg-white/5 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 resize-none"
                  placeholder="Describe your asset..."
                  rows={3}
                  required
                />
              </div>

              <div>
                <label className="block text-white font-medium mb-2">End Time *</label>
                <input
                  type="datetime-local"
                  value={newTenderForm.endTime}
                  onChange={(e) => handleFormChange('endTime', e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  className="w-full bg-white/5 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
                  required
                />
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => setCreateModalOpen(false)}
                  className="flex-1 bg-white/10 hover:bg-white/20 text-white font-semibold py-3 rounded-xl transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={submitNewTender}
                  className="flex-1 bg-gradient-to-r from-purple-500 to-fuchsia-500 hover:from-purple-600 hover:to-fuchsia-600 text-white font-semibold py-3 rounded-xl transition-all duration-300 hover:scale-105"
                >
                  Create Tender
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Button for Mobile */}
      <div className="fixed bottom-6 right-6 z-40 lg:hidden">
        <button 
          onClick={() => setCreateModalOpen(true)}
          className="w-14 h-14 bg-gradient-to-r from-purple-500 to-fuchsia-500 hover:from-purple-600 hover:to-fuchsia-600 rounded-full flex items-center justify-center shadow-lg hover:shadow-purple-500/25 transition-all duration-300 hover:scale-110"
        >
          <span className="text-white text-2xl font-bold">+</span>
        </button>
      </div>

      <style jsx>{`
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes scale-in {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .animate-slide-up {
          animation: slide-up 0.6s ease-out forwards;
        }

        .animate-scale-in {
          animation: scale-in 0.3s ease-out forwards;
        }

        .bg-grid-pattern {
          background-image: 
            linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px);
          background-size: 50px 50px;
        }

        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
};

export default Tenders;