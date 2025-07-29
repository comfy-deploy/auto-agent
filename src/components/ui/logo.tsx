import { cn } from "@/lib/utils";
import { useRive, useStateMachineInput } from '@rive-app/react-canvas-lite';
import { useEffect, useRef } from 'react';

export function Logo({
    className,
    isListening = false,
    size = 24,
    static: isStatic = false,
}: {
    className?: string;
    size?: number;
    isListening?: boolean;
    static?: boolean;
}) {
    const { rive, RiveComponent } = useRive({
        src: './auto.riv',
        stateMachines: "auto",
        autoplay: true,
        artboard: "Artboard",
    });

    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const mountedRef = useRef(true);

    const look = useStateMachineInput(rive, "auto", "look");
    const listening = useStateMachineInput(rive, "auto", "listening");

    // Set initial "look" state on mount
    useEffect(() => {
        if (isStatic) return;
        if (look && listening) {
            setTimeout(() => {
                if (!mountedRef.current) return;
                look.value = true;
                listening.value = false;
            }, 1000);
        }
    }, [look, listening, isStatic]);

    // Control "listening" based on isListening prop (takes priority)
    useEffect(() => {
        if (isStatic) return;
        if (listening && look) {
            if (isListening) {
                look.value = false;
                listening.value = true;
            } else {
                listening.value = false;
            }
        }
    }, [listening, look, isListening, isStatic]);

    // Random cycling between states when not listening and not static
    useEffect(() => {
        if (isStatic || isListening || !look || !listening) return;

        const scheduleNextCycle = () => {
            if (!mountedRef.current) return;
            
            // Random interval between 2-6 seconds
            const randomInterval = Math.random() * 4000 + 1000;

            intervalRef.current = setTimeout(() => {
                if (!mountedRef.current) return;
                
                // Randomly choose between look and idle state
                const shouldLook = Math.random() > 0.5;
                if (look) {
                    look.value = shouldLook;
                }
                if (listening) {
                    listening.value = !shouldLook;
                }
                
                scheduleNextCycle();
            }, randomInterval);
        };

        // Start the first cycle after initial mount delay
        const initialDelay = setTimeout(() => {
            if (!mountedRef.current) return;
            scheduleNextCycle();
        }, 1000); // Wait 1 second before starting random cycling

        return () => {
            mountedRef.current = false;
            clearTimeout(initialDelay);
            if (intervalRef.current) {
                clearTimeout(intervalRef.current);
            }
        };
    }, [look, listening, isListening, isStatic]);

    return (
        <div className={cn("flex items-center justify-center", className)}>
            <RiveComponent
                style={{
                    width: size,
                    height: size,
                }}
            />
        </div>
    );
}