import React, { useState } from 'react'
import { Code, User, AlertCircle, Sparkles, Layers, ArrowRight, Check } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'

interface OnboardingPageProps {
  onComplete: () => void
}

const questions = [
  {
    id: 'build_with',
    question: 'What do you build with?',
    icon: Code,
    options: ['Lovable', 'Bolt', 'Cursor', 'Other']
  },
  {
    id: 'role',
    question: "What's your role?",
    icon: User,
    options: ['Indie Hacker', 'Frontend Dev', 'Full-stack Dev', 'Other']
  },
  {
    id: 'pain',
    question: "What's your biggest pain with vibe-coded output?",
    icon: AlertCircle,
    options: ['Hard to maintain', 'No documentation', 'Messy structure', 'All of the above']
  },
  {
    id: 'help_with',
    question: 'What do you want Refract to help with most?',
    icon: Sparkles,
    options: ['Clean naming', 'Remove any types', 'Organize Tailwind', 'Add comments']
  },
  {
    id: 'codebase_size',
    question: 'How big is your codebase usually?',
    icon: Layers,
    options: ['Small (<500 lines)', 'Medium', 'Large (5k+ lines)']
  }
]

export const OnboardingPage: React.FC<OnboardingPageProps> = ({ onComplete }) => {
  const { profile, refreshProfile } = useAuth()
  const { error: toastError } = useToast()
  const [currentStep, setCurrentStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [animating, setAnimating] = useState(false)

  const handleSelect = (option: string) => {
    if (animating) return;
    
    setAnswers(prev => ({ ...prev, [questions[currentStep].id]: option }))
    
    // Auto-advance if not the last step
    if (currentStep < questions.length - 1) {
      setAnimating(true);
      setTimeout(() => {
        setCurrentStep(prev => prev + 1)
        setAnimating(false);
      }, 400) // matches animation duration
    }
  }

  const handleComplete = async () => {
    setLoading(true)

    try {
      if (!profile?.id) throw new Error('No user profile')

      const { error } = await supabase
        .from('users')
        .update({ 
          onboarding_completed: true,
          onboarding_answers: answers
        })
        .eq('id', profile.id)

      if (error) throw error

      // `AppShell`'s `onComplete` will call `refreshProfile()` so we just notify it here.
      onComplete()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save onboarding. Please try again.'
      toastError(msg)
    } finally {
      setLoading(false)
    }
  }

  const currentQ = questions[currentStep]
  const Icon = currentQ.icon
  const isLastStep = currentStep === questions.length - 1
  const hasAnsweredCurrent = !!answers[currentQ.id]

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'var(--canvas)',
      padding: '24px'
    }}>
      <style>{`
        @keyframes slideIn { 
          from { transform: translateX(16px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes onboardingFadeOut {
          from { opacity: 1; transform: translateY(0) scale(1); }
          to { opacity: 0; transform: translateY(-10px) scale(0.99); }
        }
        .step-enter { animation: slideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .step-exit { animation: onboardingFadeOut 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .onboarding-card-enter { animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .onboarding-card-exit { animation: onboardingFadeOut 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}</style>

      {/* Progress Indicator */}
      <div style={{ marginBottom: 48, display: 'flex', gap: 8 }}>
        {questions.map((_, i) => (
          <div 
            key={i}
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              background: i <= currentStep ? 'var(--primary)' : 'var(--canvas-soft-2)',
              transition: 'background 0.3s ease'
            }}
          />
        ))}
      </div>

      <div 
        key={currentStep} // forces re-render/animation on step change
        className={animating ? "onboarding-card-exit" : "onboarding-card-enter"}
        style={{ 
          width: '100%', 
          maxWidth: 480,
          background: 'var(--surface-card)',
          borderRadius: 'var(--radius)',
          padding: '40px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
          borderTop: '1px solid var(--hairline)'
        }}
      >
        <div style={{ marginBottom: 32, textAlign: 'center' }}>
          <div style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            width: 48, 
            height: 48, 
            borderRadius: '9999px', 
            background: 'var(--canvas-soft-2)',
            marginBottom: 24,
            boxShadow: '0 2px 10px rgba(0,0,0,0.2)'
          }}>
            <Icon size={24} color="var(--primary)" />
          </div>
          <h2 style={{ 
            fontSize: '32px', 
            fontWeight: 500, 
            letterSpacing: '-1.0px', 
            color: 'var(--ink)',
            lineHeight: 1.13,
            fontFamily: 'var(--font-display)'
          }}>
            {currentQ.question}
          </h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {currentQ.options.map(option => {
            const isSelected = answers[currentQ.id] === option;
            return (
              <button
                key={option}
                onClick={() => handleSelect(option)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '16px 20px',
                  background: isSelected ? 'var(--canvas-soft-2)' : 'var(--canvas)',
                  border: isSelected ? '1px solid var(--ring)' : '1px solid var(--hairline)',
                  borderRadius: '10px',
                  color: 'var(--ink)',
                  fontSize: '15px',
                  fontFamily: 'var(--font-sans)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  textAlign: 'left'
                }}
              >
                <span>{option}</span>
                {isSelected && <Check size={18} color="var(--ring)" />}
              </button>
            )
          })}
        </div>

        {isLastStep && hasAnsweredCurrent && (
          <div style={{ marginTop: 32, animation: 'slideIn 0.3s ease forwards' }}>
            <button
              onClick={handleComplete}
              disabled={loading}
              className="btn btn-primary"
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 8,
                padding: '16px',
                fontSize: '15px',
                height: 'auto'
              }}
            >
              {loading ? 'Setting up...' : "Let's go"}
              {!loading && <ArrowRight size={18} />}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
