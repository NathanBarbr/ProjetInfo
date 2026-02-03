const nextJest = require('next/jest')

/** @type {import('jest').Config} */
const createJestConfig = nextJest({
    // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
    dir: './',
})

// Add any custom config to be passed to Jest
const config = {
    coverageProvider: 'v8',
    testEnvironment: 'jsdom',

    // Setup files
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],

    // Test match patterns
    testMatch: [
        '**/__tests__/**/*.{js,jsx,ts,tsx}',
        '**/*.{spec,test}.{js,jsx,ts,tsx}'
    ],

    // Module name mapper for absolute imports and CSS
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    },

    // Coverage configuration
    collectCoverageFrom: [
        'app/**/*.{js,jsx,ts,tsx}',
        'components/**/*.{js,jsx,ts,tsx}',
        'context/**/*.{js,jsx,ts,tsx}',
        '!**/*.d.ts',
        '!**/node_modules/**',
        '!**/.next/**',
    ],

    // Coverage thresholds (optional - adjust as needed)
    coverageThresholds: {
        global: {
            branches: 50,
            functions: 50,
            lines: 50,
            statements: 50,
        },
    },
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(config)
