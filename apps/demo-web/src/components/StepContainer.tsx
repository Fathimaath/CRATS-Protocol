import React from 'react';
import { useWorkflow } from '../context/WorkflowContext';
import { Card, Button } from './UI';
import { motion } from 'framer-motion';

export function StepContainer({ 
  stepId, 
  title, 
  description, 
  children,
  onAction,
  actionText,
  isProcessing = false
}: { 
  stepId: number, 
  title: string, 
  description: string, 
  children?: React.ReactNode,
  onAction: () => void,
  actionText: string,
  isProcessing?: boolean
}) {
  const { currentStepId, markStepComplete, setCurrentStepId, steps } = useWorkflow();
  const step = steps.find(s => s.id === stepId);
  const isPast = step?.completed;

  if (currentStepId !== stepId && !isPast) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-8"
    >
      <Card className={isPast ? 'bg-slate-50 border-emerald-100 opacity-80' : 'ring-1 ring-slate-200'}>
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <span className="text-slate-400">Step {stepId}</span> • {title}
            </h2>
            <p className="text-slate-500 mt-1">{description}</p>
          </div>
          {isPast && (
            <div className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold uppercase tracking-wider">
              Completed
            </div>
          )}
        </div>

        <div className="mb-8">
          {children}
        </div>
        
        {!isPast && (
          <div className="flex justify-end border-t border-slate-100 pt-6">
            <Button onClick={onAction} disabled={isProcessing}>
              {isProcessing ? 'Processing Transaction...' : actionText}
            </Button>
          </div>
        )}
      </Card>
    </motion.div>
  );
}
