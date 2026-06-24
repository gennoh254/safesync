import { CreditCard, Smartphone, Clock, Plus, CircleCheck as CheckCircle, TriangleAlert as AlertTriangle, DollarSign, Calendar, TrendingUp, Wallet } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface PaymentRecord {
  id: string;
  amount: number;
  payment_method: 'card' | 'mpesa';
  payment_type: 'subscription' | 'alert_fee';
  status: 'completed' | 'pending' | 'failed';
  created_at: string;
  reference?: string;
  alert_id?: string;
}

interface ClientAccountsProps {
  darkMode?: boolean;
}

const MINIMUM_BALANCE = 500; // Ksh 500 minimum

export function ClientAccounts({ darkMode = false }: ClientAccountsProps) {
  const [balance, setBalance] = useState(0);
  const [paymentHistory, setPaymentHistory] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'card' | 'mpesa'>('mpesa');
  const [paymentAmount, setPaymentAmount] = useState(MINIMUM_BALANCE.toString());
  const [processing, setProcessing] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');

  useEffect(() => {
    fetchAccountData();
  }, []);

  const fetchAccountData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get phone from profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('phone')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.phone) {
        setPhoneNumber(profile.phone);
      }

      // Get payment history from payments table (we'll create this)
      const { data: payments } = await supabase
        .from('client_payments')
        .select('*')
        .eq('client_id', user.id)
        .order('created_at', { ascending: false });

      if (payments) {
        setPaymentHistory(payments as PaymentRecord[]);

        // Calculate balance from payments
        const totalCredits = payments
          .filter(p => p.payment_type === 'subscription' && p.status === 'completed')
          .reduce((sum, p) => sum + (p.amount || 0), 0);

        const totalDebits = payments
          .filter(p => p.payment_type === 'alert_fee' && p.status === 'completed')
          .reduce((sum, p) => sum + (p.amount || 0), 0);

        setBalance(totalCredits - totalDebits);
      }
    } catch (err) {
      console.error('Failed to fetch account data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async () => {
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount < MINIMUM_BALANCE) {
      alert(`Minimum payment is Ksh ${MINIMUM_BALANCE}`);
      return;
    }

    if (selectedPaymentMethod === 'mpesa' && !phoneNumber.trim()) {
      alert('Please enter your M-Pesa phone number');
      return;
    }

    setProcessing(true);

    try {
      // In production, this would call Stripe API
      // For now, we'll simulate the payment and record it

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Create a pending payment record
      await supabase
        .from('client_payments')
        .insert({
          client_id: user.id,
          amount: amount,
          payment_method: selectedPaymentMethod,
          payment_type: 'subscription',
          status: 'completed', // In production, this would be 'pending' until confirmed
          reference: `${selectedPaymentMethod === 'mpesa' ? 'MPESA' : 'CARD'}-${Date.now()}`,
        });

      // Refresh data
      await fetchAccountData();
      setShowPaymentModal(false);

      // Show success message
      alert(`Payment of Ksh ${amount} successful! Your account has been credited.`);
    } catch (err) {
      console.error('Payment failed:', err);
      alert('Payment failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const isLowBalance = balance < MINIMUM_BALANCE;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-KE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className={`p-4 ${darkMode ? 'text-white' : 'text-black'}`}>
      <h2 className="text-xl font-bold uppercase tracking-widest mb-6">Accounts & Payments</h2>

      {/* Account Balance Card */}
      <div className={`border rounded-2xl p-6 mb-6 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gradient-to-br from-blue-600 to-blue-800 border-blue-500'} text-white`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5" />
            <span className="text-sm font-bold uppercase tracking-wider opacity-90">Account Balance</span>
          </div>
          {isLowBalance && (
            <span className="text-xs font-bold bg-red-500 px-2 py-1 rounded-full flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Low Balance
            </span>
          )}
        </div>
        <p className="text-4xl font-bold mb-2">{formatCurrency(balance)}</p>
        <p className="text-sm opacity-80">
          {isLowBalance
            ? `Minimum Ksh ${MINIMUM_BALANCE} required for premium features`
            : 'Sufficient balance for emergency alerts'}
        </p>

        {/* Progress bar showing minimum balance */}
        <div className="mt-4">
          <div className="flex justify-between text-xs mb-1">
            <span>Ksh 0</span>
            <span>Min: Ksh {MINIMUM_BALANCE}</span>
          </div>
          <div className="h-2 bg-white/20 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${isLowBalance ? 'bg-red-400' : 'bg-green-400'}`}
              style={{ width: `${Math.min((balance / (MINIMUM_BALANCE * 2)) * 100, 100)}%` }}
            />
          </div>
        </div>

        <button
          onClick={() => setShowPaymentModal(true)}
          className="mt-4 w-full bg-white text-blue-700 font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-50 transition-all"
        >
          <Plus className="w-5 h-5" />
          Add Funds
        </button>
      </div>

      {/* Premium Features Info */}
      <div className={`border rounded-xl p-5 mb-6 ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-5 h-5 text-blue-600" />
          <h3 className="font-bold">Premium Features</h3>
        </div>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
            <span>Priority emergency response routing</span>
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
            <span>Real-time responder tracking</span>
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
            <span>Instant push notifications</span>
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
            <span>Detailed incident reports</span>
          </li>
        </ul>
        <p className="text-xs text-gray-500 mt-3">
          * A small fee (Ksh 50) is deducted per emergency alert sent
        </p>
      </div>

      {/* Payment History */}
      <div className={`border rounded-xl ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'} overflow-hidden`}>
        <div className={`p-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-gray-500" />
              <h3 className="font-bold">Payment History</h3>
            </div>
            <span className="text-sm text-gray-500">{paymentHistory.length} transactions</span>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">
            Loading payment history...
          </div>
        ) : paymentHistory.length === 0 ? (
          <div className="p-8 text-center">
            <DollarSign className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 font-medium">No payment history</p>
            <p className="text-gray-400 text-sm mt-1">Add funds to start using premium features</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {paymentHistory.map((payment) => (
              <div key={payment.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${
                      payment.payment_type === 'subscription'
                        ? 'bg-green-100 text-green-600'
                        : 'bg-red-100 text-red-600'
                    }`}>
                      {payment.payment_method === 'mpesa'
                        ? <Smartphone className="w-5 h-5" />
                        : <CreditCard className="w-5 h-5" />
                      }
                    </div>
                    <div>
                      <p className="font-bold text-sm">
                        {payment.payment_type === 'subscription' ? 'Account Top-up' : 'Alert Fee Deducted'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {payment.payment_method === 'mpesa' ? 'M-Pesa' : 'Credit Card'}
                        {payment.reference && ` • ${payment.reference}`}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <Calendar className="w-3 h-3 text-gray-400" />
                        <span className="text-xs text-gray-500">
                          {formatDate(payment.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${
                      payment.payment_type === 'subscription' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {payment.payment_type === 'subscription' ? '+' : '-'}{formatCurrency(payment.amount)}
                    </p>
                    <span className={`text-xs px-2 py-1 rounded-full mt-1 inline-block ${
                      payment.status === 'completed'
                        ? 'bg-green-100 text-green-700'
                        : payment.status === 'pending'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {payment.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className={`w-full max-w-md mx-4 rounded-2xl p-6 ${darkMode ? 'bg-gray-900' : 'bg-white'}`}>
            <h3 className="text-xl font-bold mb-6">Add Funds</h3>

            {/* Payment Method Selection */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button
                onClick={() => setSelectedPaymentMethod('mpesa')}
                className={`p-4 rounded-xl border-2 transition-all ${
                  selectedPaymentMethod === 'mpesa'
                    ? 'border-green-500 bg-green-50'
                    : darkMode ? 'border-gray-700 hover:border-gray-600' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Smartphone className={`w-8 h-8 mx-auto mb-2 ${selectedPaymentMethod === 'mpesa' ? 'text-green-600' : 'text-gray-400'}`} />
                <p className="font-bold text-sm">M-Pesa</p>
                <p className="text-xs text-gray-500 mt-1">Lipa na M-Pesa</p>
              </button>
              <button
                onClick={() => setSelectedPaymentMethod('card')}
                className={`p-4 rounded-xl border-2 transition-all ${
                  selectedPaymentMethod === 'card'
                    ? 'border-blue-500 bg-blue-50'
                    : darkMode ? 'border-gray-700 hover:border-gray-600' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <CreditCard className={`w-8 h-8 mx-auto mb-2 ${selectedPaymentMethod === 'card' ? 'text-blue-600' : 'text-gray-400'}`} />
                <p className="font-bold text-sm">Card</p>
                <p className="text-xs text-gray-500 mt-1">Credit/Debit</p>
              </button>
            </div>

            {/* Amount Input */}
            <div className="mb-4">
              <label className="block text-sm font-bold mb-2">Amount (Ksh)</label>
              <input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                min={MINIMUM_BALANCE}
                className={`w-full p-3 rounded-lg border text-lg font-bold ${
                  darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300 text-black'
                } focus:outline-none focus:ring-2 focus:ring-blue-500`}
              />
              <p className="text-xs text-gray-500 mt-1">Minimum: Ksh {MINIMUM_BALANCE}</p>
            </div>

            {/* Quick Amount Buttons */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[500, 1000, 2000, 5000].map((amt) => (
                <button
                  key={amt}
                  onClick={() => setPaymentAmount(amt.toString())}
                  className={`py-2 rounded-lg text-sm font-bold ${
                    paymentAmount === amt.toString()
                      ? 'bg-blue-600 text-white'
                      : darkMode ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  } transition-all`}
                >
                  {amt}
                </button>
              ))}
            </div>

            {/* Phone Number for M-Pesa */}
            {selectedPaymentMethod === 'mpesa' && (
              <div className="mb-4">
                <label className="block text-sm font-bold mb-2">M-Pesa Phone Number</label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="e.g. 0712 345 678"
                  className={`w-full p-3 rounded-lg border ${
                    darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300 text-black'
                  } focus:outline-none focus:ring-2 focus:ring-green-500`}
                />
              </div>
            )}

            {/* Card Details Placeholder */}
            {selectedPaymentMethod === 'card' && (
              <div className={`p-4 rounded-lg mb-4 ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
                <p className="text-sm text-gray-500">
                  Card payment requires Stripe integration.
                  Contact support to configure payment gateway.
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowPaymentModal(false)}
                disabled={processing}
                className={`flex-1 py-3 rounded-xl font-bold ${
                  darkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-100 hover:bg-gray-200'
                } transition-all`}
              >
                Cancel
              </button>
              <button
                onClick={handlePayment}
                disabled={processing}
                className={`flex-1 py-3 rounded-xl font-bold text-white ${
                  selectedPaymentMethod === 'mpesa'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                } transition-all disabled:opacity-50`}
              >
                {processing ? 'Processing...' : `Pay Ksh ${paymentAmount}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
