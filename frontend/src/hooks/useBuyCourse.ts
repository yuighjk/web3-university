import { useCallback, useState } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { waitForTransactionReceipt } from 'viem/actions';
import { message } from 'antd';

import { ydTokenAbi, courseMarketAbi } from '@/contracts/abis';
import { YD_TOKEN_ADDRESS, COURSE_MARKET_ADDRESS } from '@/contracts/addresses';
import type { BuyStep } from '@/types';

interface UseBuyCourseResult {
  step: BuyStep;
  buy: (courseId: bigint, price: bigint) => Promise<void>;
  reset: () => void;
}

/**
 * Strictly serial approve → buyCourse flow.
 *
 * Steps:
 *   checking   → read allowance
 *   approving  → approve tx + wait receipt  (only if allowance < price)
 *   buying     → buyCourse tx + wait receipt
 *   done       → success
 *   error      → something went wrong
 */
export function useBuyCourse(onSuccess?: () => void): UseBuyCourseResult {
  const [step, setStep] = useState<BuyStep>('idle');
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const buy = useCallback(
    async (courseId: bigint, price: bigint) => {
      if (!address || !publicClient || !walletClient) {
        message.error('请先连接钱包');
        return;
      }

      // wagmi's useWalletClient returns a typed WalletClient. The chain generic
      // is resolved at runtime by Privy/wagmi, so we access writeContract via
      // the client's own method (no viem/actions import needed here).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wc = walletClient as any;

      try {
        // 1. Check current allowance
        setStep('checking');
        const allowance = await publicClient.readContract({
          address: YD_TOKEN_ADDRESS,
          abi: ydTokenAbi,
          functionName: 'allowance',
          args: [address, COURSE_MARKET_ADDRESS],
        });

        // 2. Approve if needed — strictly wait for receipt before proceeding
        if (allowance < price) {
          setStep('approving');
          const approveHash = (await wc.writeContract({
            address: YD_TOKEN_ADDRESS,
            abi: ydTokenAbi,
            functionName: 'approve',
            args: [COURSE_MARKET_ADDRESS, price],
          })) as `0x${string}`;
          await waitForTransactionReceipt(publicClient, { hash: approveHash });
        }

        // 3. Buy course — wait for receipt
        setStep('buying');
        const buyHash = (await wc.writeContract({
          address: COURSE_MARKET_ADDRESS,
          abi: courseMarketAbi,
          functionName: 'buyCourse',
          args: [courseId],
        })) as `0x${string}`;
        await waitForTransactionReceipt(publicClient, { hash: buyHash });

        // 4. Done
        setStep('done');
        message.success('购买成功！');
        onSuccess?.();
      } catch (err: unknown) {
        setStep('error');
        const errMsg = err instanceof Error ? err.message : '交易失败';
        // Surface user-friendly message; avoid leaking stack traces
        if (errMsg.includes('User rejected') || errMsg.includes('user rejected')) {
          message.error('用户取消了交易');
        } else {
          message.error(`购买失败：${errMsg.slice(0, 80)}`);
        }
      }
    },
    [address, publicClient, walletClient, onSuccess],
  );

  const reset = useCallback(() => setStep('idle'), []);

  return { step, buy, reset };
}
