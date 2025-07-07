'use client';
import React, { useState, useEffect } from 'react';
import { ethers, formatEther, formatUnits } from 'ethers';
import * as XLSX from 'xlsx';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare global {
  interface Window {
    ethereum?: any;
  }
}

// TypeScript Interfaces
interface Network {
  name: string;
  chainId: number;
  rpc: string;
  symbol: string; // Native currency symbol for the network
}

interface TokenConfig {
  symbol: string;
  name: string;
  decimals: number;
  isNative?: boolean; // Optional property for native tokens
}

interface TokenAddressesMap {
  [key: string]: { // Token symbol as key (e.g., 'USDT')
    [chainId: number]: string; // Chain ID as key, contract address as value
  };
}

interface MultiSenderContractAddressesMap {
  [chainId: number]: string; // Chain ID as key, contract address as value
}

interface TransactionStatusItem {
  id: string;
  recipient: string;
  amount: string;
  status: 'pending' | 'sent' | 'confirmed' | 'failed';
  hash: string | null;
  error: string | null;
}

const networks: Network[] = [
  { name: 'Ethereum', chainId: 1, rpc: 'https://mainnet.infura.io/v3/', symbol: 'ETH' },
  { name: 'BNB Smart Chain', chainId: 56, rpc: 'https://bsc-dataseed.binance.org/', symbol: 'BNB' },
  { name: 'Polygon', chainId: 137, rpc: 'https://polygon-rpc.com/', symbol: 'MATIC' },
  { name: 'Avalanche', chainId: 43114, rpc: 'https://api.avax.network/ext/bc/C/rpc', symbol: 'AVAX' },
  { name: 'Fantom', chainId: 250, rpc: 'https://rpc.ftm.tools/', symbol: 'FTM' },
  { name: 'Arbitrum', chainId: 42161, rpc: 'https://arb1.arbitrum.io/rpc', symbol: 'ETH' },
  { name: 'Optimism', chainId: 10, rpc: 'https://mainnet.optimism.io', symbol: 'ETH' },
  { name: 'Base', chainId: 8453, rpc: 'https://mainnet.base.org', symbol: 'ETH' },
  { name: 'zkSync Era', chainId: 324, rpc: 'https://mainnet.era.zksync.io', symbol: 'ETH' },
  { name: 'Cronos', chainId: 25, rpc: 'https://evm.cronos.org', symbol: 'CRO' },
  { name: 'Gravity Alpha', chainId: 1625, rpc: 'https://gravity-rpc.alpha.gravity.zone', symbol: 'G' },
];

const tokenAddresses: TokenAddressesMap = {
  USDT: {
    1:  '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    56: '0x55d398326f99059fF775485246999027B3197955',
    137:'0x3813e82e6f7098b9583FC0F33a962D02018B6803',
  },
  USDC: {
    1:  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    56: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
    137:'0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  },
  DAI: {
    1:  '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    56: '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3',
    137:'0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
  },
};

const tokens: TokenConfig[] = [
  { symbol: 'USDT', name: 'Tether USD', decimals: 6 },
  { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  { symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
];

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)'
];

// ABI for the MultiSender contract (simplified for common functions)
const MULTISENDER_ABI = [
  'function sendNativeTokens(address[] calldata _recipients, uint256[] calldata _amounts) payable',
  'function sendERC20Tokens(address _tokenAddress, address[] calldata _recipients, uint256[] calldata _amounts)'
];

// DEPLOYED MULTISENDER CONTRACT ADDRESSES FOR EACH NETWORK
const MULTISENDER_CONTRACT_ADDRESSES: MultiSenderContractAddressesMap = {
  // BNB Smart Chain Mainnet
  56: "0xe9f4A6e5dC21A013c79F3e88eaaB723330e04a29",
  // Polygon Mainnet
  137: "0x007A7dAF96F6094727e086F8F3EB9ef216346340",
  // Avalanche C-Chain Mainnet
  43114: "0xD38Fc9b1DD0148C8D8C79080E638532Bd96b3205",
  // Fantom Mainnet
  250: "0xD38Fc9b1DD0148C8D8C79080E638532Bd96b3205",
  // Arbitrum One
  42161: "0xD38Fc9b1DD0148C8D8C79080E638532Bd96b3205",
  // Optimism Mainnet
  10: "0xD38Fc9b1DD0148C8D8C79080E638532Bd96b3205",
  // Base Mainnet
  8453: "0xD38Fc9b1DD0148C8D8C79080E638532Bd96b3205",
  // Gravity Alpha
  1625: "0x35a4840bbDA3ff0384821568Cee0F2BA7fDc7baD",
  // Add more as needed
};

export default function Home() {
  const [network, setNetwork] = useState(networks[2].chainId); // Default Polygon
  const [token, setToken] = useState<TokenConfig | null>(null); // No default token
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [status, setStatus] = useState('');
  const [showGasModal, setShowGasModal] = useState(false);
  const [gasMode, setGasMode] = useState('auto');
  const [balance, setBalance] = useState('--');
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [needAddNetwork, setNeedAddNetwork] = useState(false);
  const [tokenBalances, setTokenBalances] = useState<{ [symbol: string]: string }>({});
  const [tokenBalancesLoading, setTokenBalancesLoading] = useState(false);
  const [recipientsData, setRecipientsData] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [walletCount, setWalletCount] = useState(0);
  const [transactionStatuses, setTransactionStatuses] = useState<TransactionStatusItem[]>([]);
  const [showTransactionHistory, setShowTransactionHistory] = useState(false);
  const [transactionHistory, setTransactionHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [transactionsPerPage] = useState(5); // Show 5 transactions per page

  // Auto-connect wallet on page load if previously connected
  useEffect(() => {
    const checkWalletConnection = async () => {
      if (window.ethereum) {
        try {
          // Check if wallet is already connected
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts && accounts.length > 0) {
            setWalletAddress(accounts[0]);
            setWalletConnected(true);
            setStatus('Wallet reconnected automatically');
            
            // Get the current network
            const chainId = await window.ethereum.request({ method: 'eth_chainId' });
            const networkId = parseInt(chainId, 16);
            setNetwork(networkId);
            
            // Load saved transaction history
            const savedHistory = localStorage.getItem(`txHistory_${accounts[0]}`);
            if (savedHistory) {
              try {
                const parsed = JSON.parse(savedHistory);
                setTransactionHistory(parsed);
                console.log(`Loaded ${parsed.length} transactions from localStorage`);
              } catch (e) {
                console.warn('Failed to parse saved transaction history');
              }
            }
          }
        } catch (error) {
          console.log('No wallet connected or connection failed');
        }
      }
    };

    checkWalletConnection();
  }, []);

  // Save transaction history to localStorage when it changes
  useEffect(() => {
    if (walletAddress && transactionHistory.length > 0) {
      localStorage.setItem(`txHistory_${walletAddress}`, JSON.stringify(transactionHistory));
    }
  }, [transactionHistory, walletAddress]);

  // Native token for current network
  const nativeToken = networks.find(n => n.chainId === network)?.symbol;
  const nativeTokenObj: TokenConfig | null = nativeToken ? { symbol: nativeToken, name: nativeToken, decimals: 18, isNative: true } : null;

  // Show only tokens available for this network
  const availableTokens: TokenConfig[] = [nativeTokenObj, ...tokens.filter((t) => {
    const symbolKey = t.symbol as keyof typeof tokenAddresses;
    return tokenAddresses[symbolKey] && tokenAddresses[symbolKey][network];
  })].filter(Boolean) as TokenConfig[];

  useEffect(() => {
    if (nativeTokenObj && token === null) {
      setToken(nativeTokenObj);
    }
  }, [nativeTokenObj, token]);

  // Helper: get token address for current network
  const getTokenAddress = (symbol: string): string => {
    if (symbol === nativeToken) return '';
    const symbolKey = symbol as keyof typeof tokenAddresses;
    return tokenAddresses[symbolKey]?.[network] || '';
  };

  // Handle CSV and Excel file upload and parse their content
  useEffect(() => {
    if (file) {
      const fileExtension = file.name.toLowerCase().split('.').pop();
      
      if (fileExtension === 'csv') {
        // Handle CSV files
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          if (content) {
            const lines = content.split(/\r?\n/);
            const validLines = lines.map(line => {
              const parts = line.split(',').map(p => p.trim());
              if (parts.length === 2 && ethers.isAddress(parts[0]) && !isNaN(Number(parts[1])) && Number(parts[1]) > 0) {
                return `${parts[0]},${parts[1]}`;
              }
              return null; // Invalid line
            }).filter(Boolean);
            
            const parsedData = validLines.join('\n');
            setRecipientsData(parsedData);
            setWalletCount(validLines.length);
            setStatus(`CSV file loaded and parsed. Found ${validLines.length} valid wallet addresses.`);
          } else {
            setStatus('Failed to read CSV file content.');
          }
        };
        reader.onerror = () => {
          setStatus('Error reading CSV file.');
        };
        reader.readAsText(file);
      } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
        // Handle Excel files
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            
            // Get the first sheet
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            
            // Convert to JSON
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            // Parse the data (expecting address in first column, amount in second column)
            const validRows = jsonData
              .filter((row: any) => row && row.length >= 2) // Ensure row has at least 2 columns
              .map((row: any) => {
                const address = String(row[0]).trim();
                const amount = String(row[1]).trim();
                
                if (ethers.isAddress(address) && !isNaN(Number(amount)) && Number(amount) > 0) {
                  return `${address},${amount}`;
                }
                return null; // Invalid row
              })
              .filter(Boolean);
            
            const parsedData = validRows.join('\n');
            setRecipientsData(parsedData);
            setWalletCount(validRows.length);
            setStatus(`Excel file (${fileExtension.toUpperCase()}) loaded and parsed. Found ${validRows.length} valid wallet addresses.`);
          } catch (error) {
            console.error('Error parsing Excel file:', error);
            setStatus('Error parsing Excel file. Please check the file format.');
          }
        };
        reader.onerror = () => {
          setStatus('Error reading Excel file.');
        };
        reader.readAsArrayBuffer(file);
      } else {
        setStatus('Unsupported file format. Please use CSV, XLSX, or XLS files.');
        setWalletCount(0);
      }
    } else {
      // Reset wallet count when no file is selected
      setWalletCount(0);
    }
  }, [file]);

  // Reset balance on network/token change or wallet disconnect
  useEffect(() => {
    setBalance('--');
  }, [network, token, walletConnected]);

  // Switch network in Metamask (only if wallet connected)
  const handleNetworkChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!walletConnected) {
      setStatus('Please connect your wallet first.');
      console.warn('Network change attempted without wallet connected.');
      return;
    }
    const chainId = Number(e.target.value);
    setNetwork(chainId);
    setNeedAddNetwork(false);
    setToken(null); // Reset token selection on network change
    const net = networks.find(n => n.chainId === chainId);
    if (window.ethereum && net) {
      console.log(`Attempting to switch to network: ${net.name} (ChainID: ${chainId}) (0x${chainId.toString(16)})`);
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x' + chainId.toString(16) }],
        });
        setStatus(`Switched to ${net.name}`);
        console.log(`Successfully switched to ${net.name}`);
      } catch (switchError: any) {
        setStatus('Network switch failed: ' + (switchError && switchError.message ? switchError.message : 'Unknown error. Check console.'));
        console.error('Network switch error:', switchError);
        console.error('Full switch error object:', JSON.stringify(switchError, null, 2));
        if (switchError && switchError.code === 4902) {
          setNeedAddNetwork(true);
          setStatus(`${net.name} not found in Metamask. Please add the network.`);
          console.log('Network not found (code 4902), prompting to add network.');
        }
      }
    } else {
      setStatus('window.ethereum not found or network data missing.');
      console.error('window.ethereum not found or network details missing for chainId:', chainId);
    }
  };

  // Add network in Metamask
  const handleAddNetwork = async () => {
    if (!walletConnected) {
      setStatus('Please connect your wallet first.');
      console.warn('Add network attempted without wallet connected.');
      return;
    }
    const net = networks.find(n => n.chainId === network);
    if (window.ethereum && net) {
      console.log(`Attempting to add network: ${net.name} (ChainID: ${net.chainId})`);
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: '0x' + net.chainId.toString(16),
            chainName: net.name,
            rpcUrls: [net.rpc],
            nativeCurrency: { name: net.symbol, symbol: net.symbol, decimals: 18 },
          }],
        });
        setNeedAddNetwork(false);
        setStatus(`${net.name} added to Metamask!`);
        console.log(`${net.name} successfully added to Metamask.`);
      } catch (addError: any) {
        setStatus('Network add failed: ' + (addError && addError.message ? addError.message : 'Unknown error. See console.'));
        console.error('Network add error:', addError);
      }
    } else {
      setStatus('window.ethereum not found or network data missing.');
      console.error('window.ethereum not found or network details missing for chainId:', network);
    }
  };

  // Fetch balance for selected token
  useEffect(() => {
    const fetchBalance = async () => {
      if (!walletConnected || !walletAddress || !token) {
        setBalance('--');
        return;
      }
      
      setBalanceLoading(true);
      console.log(`Fetching balance for ${token.symbol} on network ${network}`);
      
      try {
        const net = networks.find(n => n.chainId === network);
        if (!net) {
          console.error('Network not found for chainId:', network);
          setBalance('--');
          setBalanceLoading(false);
          return;
        }

        let provider;
        if (window.ethereum) {
          provider = new ethers.BrowserProvider(window.ethereum);
          const currentChainId = await provider.getNetwork().then(n => n.chainId);
          console.log(`Wallet chainId: ${currentChainId}, App network: ${network}`);
          
          if (Number(currentChainId) !== Number(network)) {
            setStatus(`Wallet is on wrong network (${currentChainId}). Please switch to ${net.name}.`);
            setBalanceLoading(false);
            return;
          }
        } else {
          provider = new ethers.JsonRpcProvider(net.rpc);
        }

        if (token.isNative) {
          const bal = await provider.getBalance(walletAddress);
          // Show very small amounts without rounding to 0
          const formattedBal = formatEther(bal);
          setBalance(formattedBal);
          console.log(`Native balance raw: ${bal.toString()}, formatted: ${formattedBal} ${token.symbol}`);
        } else {
          const tokenAddr = getTokenAddress(token.symbol);
          if (!tokenAddr) {
            setStatus(`Token address not found for ${token.symbol} on ${net.name}.`);
            setBalance('--');
            setBalanceLoading(false);
            return;
          }
          
          const contract = new ethers.Contract(tokenAddr, ERC20_ABI, provider);
          const bal = await contract.balanceOf(walletAddress);
          // Show very small amounts without rounding to 0
          const formattedBal = formatUnits(bal, token.decimals);
          setBalance(formattedBal);
          console.log(`ERC20 balance raw: ${bal.toString()}, formatted: ${formattedBal} ${token.symbol}`);
        }
      } catch (e: any) {
        setBalance('--');
        setStatus('Failed to fetch balance: ' + (e.message || 'Unknown error'));
        console.error('Balance fetch error:', e);
      }
      
      setBalanceLoading(false);
    };
    
    fetchBalance();
  }, [walletConnected, walletAddress, network, token]);

  // Fetch all token balances for modal
  useEffect(() => {
    const fetchAllTokenBalances = async () => {
      if (!showTokenModal || !walletConnected || !walletAddress) {
        setTokenBalances({});
        return;
      }
      
      setTokenBalancesLoading(true);
      console.log(`Fetching all token balances for network ${network}`);
      
      try {
        const net = networks.find(n => n.chainId === network);
        if (!net) {
          console.error('Network not found for chainId:', network);
          setTokenBalancesLoading(false);
          return;
        }

        let provider;
        if (window.ethereum) {
          provider = new ethers.BrowserProvider(window.ethereum);
          const currentChainId = await provider.getNetwork().then(n => n.chainId);
          
          if (Number(currentChainId) !== Number(network)) {
            setStatus(`Wallet is on wrong network (${currentChainId}). Please switch to ${net.name}.`);
            setTokenBalancesLoading(false);
            return;
          }
        } else {
          provider = new ethers.JsonRpcProvider(net.rpc);
        }

        const balances: { [symbol: string]: string } = {};
        
        for (const t of availableTokens) {
          try {
            if (t.isNative) {
              const bal = await provider.getBalance(walletAddress);
              // Show very small amounts without rounding to 0
              balances[t.symbol] = formatEther(bal);
              console.log(`Native ${t.symbol} raw: ${bal.toString()}, formatted: ${balances[t.symbol]}`);
            } else {
              const tokenAddr = getTokenAddress(t.symbol);
              if (!tokenAddr) {
                balances[t.symbol] = '--';
                continue;
              }
              
              const contract = new ethers.Contract(tokenAddr, ERC20_ABI, provider);
              const bal = await contract.balanceOf(walletAddress);
              // Show very small amounts without rounding to 0
              balances[t.symbol] = formatUnits(bal, t.decimals);
              console.log(`ERC20 ${t.symbol} raw: ${bal.toString()}, formatted: ${balances[t.symbol]}`);
            }
          } catch (e: any) {
            balances[t.symbol] = '--';
            console.error(`Error fetching ${t.symbol}:`, e);
          }
        }
        
        setTokenBalances(balances);
        console.log('All balances fetched:', balances);
      } catch (e: any) {
        console.error('Error in fetchAllTokenBalances:', e);
        setTokenBalances({});
      }
      
      setTokenBalancesLoading(false);
    };
    
    if (showTokenModal) {
      fetchAllTokenBalances();
    }
  }, [showTokenModal, walletConnected, walletAddress, network]);

  // Fetch transaction history from blockchain explorer
  const fetchTransactionHistory = async () => {
    if (!walletConnected || !walletAddress) {
      setStatus('Please connect your wallet first.');
      return;
    }

    setHistoryLoading(true);
    setStatus('Fetching transaction history...');

    try {
      const net = networks.find(n => n.chainId === network);
      if (!net) {
        setStatus('Network not found.');
        setHistoryLoading(false);
        return;
      }

      // Load saved transaction history from localStorage
      const savedHistory = localStorage.getItem(`txHistory_${walletAddress}`);
      let transactions = [];
      
      if (savedHistory) {
        try {
          transactions = JSON.parse(savedHistory);
        } catch (e) {
          console.warn('Failed to parse saved transaction history');
        }
      }

      // Only show real transactions, no demo data
      if (transactions.length === 0) {
        setStatus('No transaction history found. Make some transactions to see them here.');
        setTransactionHistory([]);
        setShowTransactionHistory(true);
        setHistoryLoading(false);
        return;
      }

      setTransactionHistory(transactions);
      setStatus(`Showing ${transactions.length} transactions`);
      setCurrentPage(1); // Reset to first page when opening
      setShowTransactionHistory(true);

    } catch (error: any) {
      console.error('Error fetching transaction history:', error);
      setStatus('Failed to fetch transaction history: ' + (error.message || 'Network error'));
      setTransactionHistory([]);
    }

    setHistoryLoading(false);
  };

  // Add a new transaction to history
  const addTransactionToHistory = (tx: any) => {
    const newTransaction = {
      hash: tx.hash,
      from: tx.from || walletAddress,
      to: tx.to,
      value: tx.value || '0',
      gasUsed: tx.gasUsed || '0',
      gasPrice: tx.gasPrice || '0',
      timestamp: new Date().toLocaleString(),
      status: tx.status || 'Success',
      network: networks.find(n => n.chainId === network)?.name || 'Unknown',
      blockNumber: 'latest'
    };

    const updatedHistory = [newTransaction, ...transactionHistory].slice(0, 100); // Keep last 100 transactions
    setTransactionHistory(updatedHistory);
    
    // Save to localStorage immediately
    if (walletAddress) {
      localStorage.setItem(`txHistory_${walletAddress}`, JSON.stringify(updatedHistory));
    }
  };

  // Pagination functions
  const nextPage = () => {
    const totalPages = Math.ceil(transactionHistory.length / transactionsPerPage);
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const prevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  // Get current transactions for display
  const getCurrentTransactions = () => {
    const startIndex = (currentPage - 1) * transactionsPerPage;
    const endIndex = startIndex + transactionsPerPage;
    return transactionHistory.slice(startIndex, endIndex);
  };

  const totalPages = Math.ceil(transactionHistory.length / transactionsPerPage);

  // Wallet connect logic
  const handleConnectWallet = async () => {
    setStatus('Connecting...');
    console.log('Attempting to connect wallet...');
    if (typeof window === 'undefined' || !window.ethereum) {
      setStatus('No EVM wallet found. Please install Metamask or Bitget.');
      console.error('window.ethereum is not defined. Wallet not found.');
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      setWalletAddress(accounts[0]);
      setWalletConnected(true);
      setStatus('Wallet connected!');
      console.log('Wallet connected:', accounts[0]);
    } catch (error) {
      setStatus('Wallet connection failed. See console for details.');
      console.error('Wallet connection error:', error);
    }
  };

  // Placeholder for send logic
  const handleSend = async () => {
    if (!walletConnected || !walletAddress) {
      setStatus('Please connect your wallet.');
      return;
    }
    if (!token) {
      setStatus('Please select a token.');
      return;
    }
    if (!recipientsData) {
      setStatus('Please enter recipient addresses and amounts, or upload a CSV.');
      return;
    }

    const lines = recipientsData.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length === 0) {
      setStatus('No valid recipient data found.');
      return;
    }

    const newTransactionStatuses: TransactionStatusItem[] = lines.map((line, index) => {
      const parts = line.split(',').map(p => p.trim());
      const recipientAddress = parts[0];
      const amountStr = parts[1];

      if (!ethers.isAddress(recipientAddress) || isNaN(Number(amountStr)) || Number(amountStr) <= 0) {
        return {
          id: `${Date.now()}-${index}`,
          recipient: recipientAddress,
          amount: amountStr,
          status: 'failed' as const,
          hash: null,
          error: 'Invalid address or amount format',
        };
      }
      return {
        id: `${Date.now()}-${index}`,
        recipient: recipientAddress,
        amount: amountStr,
        status: 'pending' as const,
        hash: null,
        error: null,
      };
    });

    // Filter out failed transactions before proceeding with send logic
    const transactionsToSend = newTransactionStatuses.filter(tx => tx.status === 'pending');

    if (transactionsToSend.length === 0) {
      setStatus('No valid transactions to send. Check input format.');
      setTransactionStatuses(newTransactionStatuses); // Still display failed ones in UI
      return;
    }

    setTransactionStatuses(newTransactionStatuses); // Update state with all statuses, including failed ones
    setStatus('Preparing transactions...');

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      const currentMultiSenderAddress = MULTISENDER_CONTRACT_ADDRESSES[network];
      if (!currentMultiSenderAddress) {
        setStatus(`MultiSender contract not deployed on ${networks.find(n => n.chainId === network)?.name || 'this network'}.`);
        return;
      }

      const multiSenderContract = new ethers.Contract(currentMultiSenderAddress, MULTISENDER_ABI, signer);

      // Prepare arrays for bulk send using only valid transactions
      const recipientsArray = transactionsToSend.map(tx => tx.recipient);
      const amountsArray = transactionsToSend.map(tx => {
        if (!token) return 0n; // Should not happen due to earlier check
        return token.isNative ? ethers.parseEther(tx.amount) : ethers.parseUnits(tx.amount, token.decimals);
      });

      let tx;
      if (token && token.isNative) { // Ensure token is not null before checking isNative
        // Native token transfer via MultiSender contract
        const totalNativeAmount = amountsArray.reduce((sum, current) => sum + current, 0n);
        setStatus(`Sending ${formatEther(totalNativeAmount)} ${token.symbol} to ${recipientsArray.length} recipients via MultiSender...`);
        tx = await multiSenderContract.sendNativeTokens(recipientsArray, amountsArray, { value: totalNativeAmount });
      } else if (token) { // Ensure token is not null for ERC20
        // ERC20 token transfer via MultiSender contract
        const tokenAddr = getTokenAddress(token.symbol);
        if (!tokenAddr) {
          setStatus(`Token address not found for ${token.symbol}.`);
          return;
        }
        const erc20Contract = new ethers.Contract(tokenAddr, ERC20_ABI, signer);
        const totalERC20Amount = amountsArray.reduce((sum, current) => sum + current, 0n);

        setStatus(`Approving MultiSender to spend ${formatUnits(totalERC20Amount, token.decimals)} ${token.symbol}...`);
        const approveTx = await erc20Contract.approve(currentMultiSenderAddress, totalERC20Amount);
        await approveTx.wait(); // Wait for approval to be mined

        setStatus(`Approval confirmed. Sending ${formatUnits(totalERC20Amount, token.decimals)} ${token.symbol} to ${recipientsArray.length} recipients via MultiSender...`);
        tx = await multiSenderContract.sendERC20Tokens(tokenAddr, recipientsArray, amountsArray);
      } else {
        setStatus('No token selected for transfer.');
        return; // Exit if no token is selected
      }

      // Update all transaction statuses to sent/confirmed/failed after the single contract call
      const receipt = await tx.wait();
      if (receipt && receipt.status === 1) {
        setStatus('Bulk transaction confirmed!');
        setTransactionStatuses(prev => prev.map((t): TransactionStatusItem => ({ ...t, status: 'confirmed', hash: tx.hash }))
        );
        
        // Add to transaction history
        addTransactionToHistory({
          hash: tx.hash,
          from: walletAddress,
          to: recipientsArray.join(', '), // Multiple recipients
          value: token.isNative ? formatEther(amountsArray.reduce((sum, current) => sum + current, 0n)) : formatUnits(amountsArray.reduce((sum, current) => sum + current, 0n), token.decimals),
          status: 'Success'
        });
      } else {
        setStatus('Bulk transaction failed to confirm.');
        setTransactionStatuses(prev => prev.map((t): TransactionStatusItem => ({ ...t, status: 'failed', hash: tx.hash, error: 'Transaction failed to confirm.' }))
        );
      }
      setRecipientsData(''); // Clear textarea after sending

    } catch (bulkError: any) {
      setStatus('Bulk transaction process failed: ' + (bulkError.message || 'Unknown error.'));
      console.error('Bulk transaction process error:', bulkError);
      // Mark all as failed if the main contract call fails
      setTransactionStatuses(prev => prev.map((t): TransactionStatusItem => ({
        ...t, status: 'failed', error: bulkError.message || 'Unknown error.'
      }))
      );
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f6f8fa', padding: '40px 0', fontFamily: 'Segoe UI, Arial, sans-serif', color: '#111' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: 32, color: '#111' }}>
        <h1 style={{ textAlign: 'center', color: '#6c63ff', fontWeight: 700, fontSize: 32, marginBottom: 32 }}>Bulk Token Transfer Tool</h1>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', color: '#111' }}>
          {/* Left Panel: Wallet Connection */}
          <div style={{ flex: 1, minWidth: 320, background: '#fafbfc', borderRadius: 12, padding: 24, border: '1px solid #eee', color: '#111' }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16, color: '#111' }}>Wallet Connection</h2>
            <div style={{ marginBottom: 12 }}>
              <b>Wallet Address:</b><br />
              <span style={{ fontFamily: 'monospace', fontSize: 15, color: '#111' }}>{walletConnected ? walletAddress : 'Not connected'}</span>
            </div>
            <div style={{ marginBottom: 12 }}>
              <b>Balance:</b> <span style={{ background: '#e3eafd', color: '#111', borderRadius: 6, padding: '2px 8px', fontWeight: 600 }}>{balanceLoading ? 'Loading...' : balance !== '--' && token ? `${balance} ${token.symbol}` : '--'}</span>
            </div>
            <div style={{ marginBottom: 12 }}>
              <b>Network:</b> <span style={{ background: '#d4f8e8', color: '#111', borderRadius: 6, padding: '2px 8px', fontWeight: 600 }}>{networks.find(n => n.chainId === network)?.name}</span>
            </div>
            <button onClick={walletConnected ? () => { setWalletConnected(false); setWalletAddress(''); setStatus('Wallet disconnected.'); setBalance('--'); setToken(null); } : handleConnectWallet} style={{ width: '100%', padding: 12, borderRadius: 8, background: walletConnected ? '#e74c3c' : '#6c63ff', color: '#fff', fontWeight: 600, border: 'none', marginBottom: 12, cursor: 'pointer', fontSize: 16 }}>
              {walletConnected ? 'Disconnect Wallet' : 'Connect Wallet'}
            </button>
            <div style={{ marginTop: 8, color: '#888', fontSize: 14 }}>{status}</div>
            <hr style={{ margin: '24px 0 16px 0', border: 'none', borderTop: '1px solid #eee' }} />
            <h3 style={{ fontSize: 17, fontWeight: 500, marginBottom: 8, color: '#111' }}>Network Selection</h3>
            <label htmlFor="network-select" style={{ display: 'none' }}>Network</label>
            <select
              id="network-select"
              name="network"
              value={network}
              onChange={handleNetworkChange}
              style={{ 
                width: '100%', 
                marginBottom: 12, 
                padding: 8, 
                borderRadius: 8, 
                border: '1px solid #ddd', 
                color: '#fff',
                backgroundColor: '#333',
                fontSize: 14,
                fontWeight: 500
              }}
            >
              {networks.map(net => (
                <option 
                  key={net.chainId} 
                  value={net.chainId}
                  style={{ 
                    backgroundColor: '#333', 
                    color: '#fff',
                    padding: '8px'
                  }}
                >
                  {net.name}
                </option>
              ))}
            </select>
            <button onClick={handleAddNetwork} disabled={!needAddNetwork} style={{ width: '100%', padding: 8, borderRadius: 8, background: needAddNetwork ? '#6c63ff' : '#ccc', color: '#fff', fontWeight: 600, border: 'none', fontSize: 15, cursor: needAddNetwork ? 'pointer' : 'not-allowed' }}>Add Network</button>
            
            {/* Transaction History Section */}
            <hr style={{ margin: '24px 0 16px 0', border: 'none', borderTop: '1px solid #eee' }} />
            <h3 style={{ fontSize: 17, fontWeight: 500, marginBottom: 8, color: '#111' }}>Transaction History</h3>
            <button 
              onClick={fetchTransactionHistory} 
              disabled={!walletConnected || historyLoading}
              style={{ 
                width: '100%', 
                padding: 8, 
                borderRadius: 8, 
                background: walletConnected && !historyLoading ? '#28a745' : '#ccc', 
                color: '#fff', 
                fontWeight: 600, 
                border: 'none', 
                fontSize: 15, 
                cursor: walletConnected && !historyLoading ? 'pointer' : 'not-allowed',
                marginBottom: 12
              }}
            >
              {historyLoading ? 'Loading...' : 'View Transaction History'}
            </button>
            
            {/* Transaction History Modal */}
            {showTransactionHistory && (
              <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.7)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 1000
              }}>
                <div style={{
                  background: '#fff',
                  borderRadius: 12,
                  padding: 24,
                  maxWidth: 800,
                  maxHeight: '80vh',
                  overflow: 'auto',
                  width: '90%'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h2 style={{ margin: 0, color: '#111' }}>Transaction History</h2>
                    <button 
                      onClick={() => setShowTransactionHistory(false)}
                      style={{
                        background: '#e74c3c',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        padding: '8px 12px',
                        cursor: 'pointer',
                        fontSize: 14
                      }}
                    >
                      ✕ Close
                    </button>
                  </div>
                  
                  {transactionHistory.length > 0 ? (
                    <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
                      {getCurrentTransactions().map((tx, index) => (
                        <div key={index} style={{
                          border: '1px solid #eee',
                          borderRadius: 8,
                          padding: 16,
                          marginBottom: 12,
                          background: '#fafbfc'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 700, color: '#111', fontSize: 16 }}>
                                {parseFloat(tx.value).toFixed(6)} {networks.find(n => n.chainId === network)?.symbol}
                              </span>
                              <span style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                                {tx.from === walletAddress ? 'Sent' : 'Received'}
                              </span>
                            </div>
                            <span style={{
                              background: tx.status === 'Success' ? '#d4edda' : '#f8d7da',
                              color: tx.status === 'Success' ? '#155724' : '#721c24',
                              padding: '4px 8px',
                              borderRadius: 4,
                              fontSize: 12,
                              fontWeight: 600
                            }}>
                              {tx.status}
                            </span>
                          </div>
                          <div style={{ fontSize: 14, color: '#666', marginBottom: 4 }}>
                            <strong>From:</strong> {tx.from.slice(0, 6)}...{tx.from.slice(-4)}
                          </div>
                          <div style={{ fontSize: 14, color: '#666', marginBottom: 4 }}>
                            <strong>To:</strong> {tx.to.slice(0, 6)}...{tx.to.slice(-4)}
                          </div>
                          <div style={{ fontSize: 14, color: '#666', marginBottom: 4 }}>
                            <strong>Hash:</strong> {tx.hash.slice(0, 10)}...{tx.hash.slice(-8)}
                          </div>
                          <div style={{ fontSize: 14, color: '#666' }}>
                            <strong>Time:</strong> {tx.timestamp}
                          </div>
                        </div>
                      ))}
                      
                      {/* Pagination Controls */}
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        padding: '16px 0', 
                        borderTop: '1px solid #eee',
                        marginTop: 16
                      }}>
                        <button 
                          onClick={prevPage} 
                          disabled={currentPage === 1}
                          style={{ 
                            padding: '8px 16px', 
                            borderRadius: 6, 
                            background: currentPage === 1 ? '#ccc' : '#6c63ff', 
                            color: '#fff', 
                            border: 'none', 
                            cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                            fontSize: 14,
                            fontWeight: 600
                          }}
                        >
                          ← Previous
                        </button>
                        
                        <span style={{ color: '#666', fontSize: 14 }}>
                          Page {currentPage} of {totalPages} ({transactionHistory.length} total transactions)
                        </span>
                        
                        <button 
                          onClick={nextPage} 
                          disabled={currentPage === totalPages}
                          style={{ 
                            padding: '8px 16px', 
                            borderRadius: 6, 
                            background: currentPage === totalPages ? '#ccc' : '#6c63ff', 
                            color: '#fff', 
                            border: 'none', 
                            cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                            fontSize: 14,
                            fontWeight: 600
                          }}
                        >
                          Next →
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', color: '#666', padding: 40 }}>
                      {historyLoading ? 'Loading transactions...' : (
                        <div>
                          <div style={{ fontSize: 18, marginBottom: 12 }}>No transactions found</div>
                          <div style={{ fontSize: 14, color: '#888' }}>
                            Make some token transfers to see your transaction history here.
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          {/* Right Panel: Token Transfer */}
          <div style={{ flex: 2, minWidth: 340, background: '#fafbfc', borderRadius: 12, padding: 24, border: '1px solid #eee', color: '#111' }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16, color: '#111' }}>Token Transfer</h2>
            <button onClick={() => setShowTokenModal(true)} style={{ width: '100%', padding: 12, borderRadius: 8, background: 'linear-gradient(90deg, #6c63ff 60%, #a084ee 100%)', color: '#fff', fontWeight: 600, border: 'none', fontSize: 16, marginBottom: 16 }}>+ Select a token</button>
            <div style={{ marginBottom: 12, color: '#111', fontSize: 15 }}>
              {networks.find(n => n.chainId === network)?.name} &nbsp;|&nbsp; <b>Balance:</b> {balanceLoading ? 'Loading...' : balance !== '--' && token ? `${balance} ${token.symbol}` : '--'}
            </div>
            {/* New Bulk Transfer UI */}
            <h3 style={{ fontSize: 17, fontWeight: 500, marginTop: 24, marginBottom: 8, color: '#111' }}>Bulk Recipients & Amounts</h3>
            <label htmlFor="recipientsData" style={{ display: 'none' }}>Bulk Recipients Data</label>
            <textarea
              id="recipientsData"
              name="recipientsData"
              rows={8}
              value={recipientsData}
              onChange={e => setRecipientsData(e.target.value)}
              placeholder="Enter recipient addresses and amounts (e.g., 0xabc...,1.5\n0xdef...,2.0) or upload a CSV/Excel file."
              style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ddd', marginBottom: 12, color: '#111', resize: 'vertical' }}
            ></textarea>
            <div style={{ marginBottom: 12 }}>
              <label htmlFor="fileUpload" style={{ fontWeight: 500, color: '#111', cursor: 'pointer', display: 'block', padding: 8, borderRadius: 8, background: '#e3eafd', textAlign: 'center' }}>
                Upload CSV or Excel File
              </label>
              <input
                id="fileUpload"
                name="fileUpload"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={e => setFile(e.target.files ? e.target.files[0] : null)}
                style={{ display: 'none' }}
              />
              {file && (
                <div style={{ marginLeft: 8, fontSize: 14, color: '#888' }}>
                  <div>{file.name} selected.</div>
                  {walletCount > 0 && (
                    <div style={{ color: '#28a745', fontWeight: 600, marginTop: 4 }}>
                      📊 {walletCount} wallet addresses found
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* End New Bulk Transfer UI */}
            <div style={{ marginBottom: 12 }}>
              <button onClick={() => setShowGasModal(true)} style={{ width: '100%', padding: 8, borderRadius: 8, background: '#e3eafd', color: '#6c63ff', fontWeight: 600, border: 'none', fontSize: 15, marginBottom: 8 }}>
                <span style={{ marginRight: 8 }}>⚙️</span>Gas Settings
              </button>
            </div>
            <button onClick={handleSend} style={{ width: '100%', padding: 12, borderRadius: 8, background: '#4285f4', color: '#fff', fontWeight: 600, border: 'none', fontSize: 16, marginBottom: 12 }}>Transfer Tokens</button>
          </div>
        </div>
        {/* Token Modal */}
        {showTokenModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: 32, minWidth: 340, boxShadow: '0 4px 24px rgba(0,0,0,0.12)', color: '#111' }}>
              <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16, color: '#111' }}>Select a Token</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {availableTokens
                  .filter(t => {
                    if (!walletConnected || tokenBalancesLoading || tokenBalances[t.symbol] === undefined) return true; // Show all if not connected, loading, or balance not yet fetched
                    const balance = Number(tokenBalances[t.symbol].replace(/,/g, '')); // Convert formatted balance string to number
                    return balance > 0; // Only show if balance is greater than 0
                  })
                  .map(t => {
                    let displayBalance = '--';
                    if (walletConnected) {
                      if (tokenBalancesLoading) {
                        displayBalance = 'Loading...';
                      } else if (tokenBalances[t.symbol] !== undefined) {
                        displayBalance = tokenBalances[t.symbol];
                      }
                    }
                    return (
                      <li key={t.symbol} style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: 8, borderRadius: 8, background: token && t.symbol === token.symbol ? '#e3eafd' : 'transparent', color: '#111' }} onClick={() => { setToken(t); setShowTokenModal(false); }}>
                        <span><b>{t.symbol}</b> <span style={{ color: '#888', fontWeight: 400 }}>{t.name}</span></span>
                        <span style={{ fontWeight: 600 }}>{displayBalance}</span>
                      </li>
                    );
                  })}
              </ul>
              <button onClick={() => setShowTokenModal(false)} style={{ marginTop: 16, width: '100%', padding: 10, borderRadius: 8, background: '#6c63ff', color: '#fff', fontWeight: 600, border: 'none', fontSize: 15 }}>Close</button>
            </div>
          </div>
        )}
        {/* Gas Modal */}
        {showGasModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: 32, minWidth: 340, boxShadow: '0 4px 24px rgba(0,0,0,0.12)', color: '#111' }}>
              <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16, color: '#111' }}>Gas Settings</h3>
              <div style={{ marginBottom: 16, color: '#111' }}>
                <label style={{ fontWeight: 500, marginRight: 16 }}>
                  <input type="radio" checked={gasMode === 'auto'} onChange={() => setGasMode('auto')} /> Auto
                </label>
                <label style={{ fontWeight: 500 }}>
                  <input type="radio" checked={gasMode === 'manual'} onChange={() => setGasMode('manual')} /> Manual
                </label>
              </div>
              {gasMode === 'manual' && (
                <input type="number" placeholder="Enter gas value" style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ddd', marginBottom: 16, color: '#111' }} />
              )}
              <button onClick={() => setShowGasModal(false)} style={{ width: '100%', padding: 10, borderRadius: 8, background: '#6c63ff', color: '#fff', fontWeight: 600, border: 'none', fontSize: 15 }}>Close</button>
            </div>
          </div>
        )}
        {/* Transaction History - Display Persistent Transaction History */}
        <div style={{ marginTop: 40, background: '#fafbfc', borderRadius: 12, padding: 24, border: '1px solid #eee', color: '#111' }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16, color: '#111' }}>Recent Transactions</h2>
          {transactionHistory.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 8, padding: 16, border: '1px solid #eee', fontSize: 15, color: '#888', textAlign: 'center' }}>
              No transaction history found. Make some transfers to see them here.
            </div>
          ) : (
            <div style={{ background: '#fff', borderRadius: 8, padding: 16, border: '1px solid #eee', fontSize: 15, color: '#111' }}>
              {transactionHistory.slice(0, 5).map((tx, index) => (
                <div key={index} style={{ 
                  marginBottom: 12, 
                  padding: 12, 
                  border: '1px solid #eee', 
                  borderRadius: 8, 
                  background: '#fafbfc',
                  borderBottom: index < Math.min(5, transactionHistory.length - 1) ? '1px dashed #eee' : 'none' 
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 16, color: '#111' }}>
                        {parseFloat(tx.value).toFixed(6)} {networks.find(n => n.chainId === network)?.symbol}
                      </span>
                      <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                        {tx.from === walletAddress ? 'Sent' : 'Received'}
                      </div>
                    </div>
                    <span style={{
                      background: tx.status === 'Success' ? '#d4edda' : '#f8d7da',
                      color: tx.status === 'Success' ? '#155724' : '#721c24',
                      padding: '4px 8px',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600
                    }}>
                      {tx.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, color: '#666', marginBottom: 4 }}>
                    <strong>To:</strong> {tx.to.slice(0, 6)}...{tx.to.slice(-4)}
                  </div>
                  <div style={{ fontSize: 14, color: '#666', marginBottom: 4 }}>
                    <strong>Hash:</strong> {tx.hash.slice(0, 10)}...{tx.hash.slice(-8)}
                  </div>
                  <div style={{ fontSize: 14, color: '#666' }}>
                    <strong>Time:</strong> {tx.timestamp}
                  </div>
                </div>
              ))}
              {transactionHistory.length > 5 && (
                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <button 
                    onClick={fetchTransactionHistory}
                    style={{ 
                      padding: '8px 16px', 
                      borderRadius: 6, 
                      background: '#6c63ff', 
                      color: '#fff', 
                      border: 'none', 
                      cursor: 'pointer',
                      fontSize: 14,
                      fontWeight: 600
                    }}
                  >
                    View All Transactions ({transactionHistory.length} total)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}