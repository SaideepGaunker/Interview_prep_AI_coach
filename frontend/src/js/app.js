/**
 * Main AngularJS application module
 */
(function() {
    'use strict';

    angular.module('interviewPrepApp', [
        'ngRoute',
        'ngAnimate',
        'ngSanitize'
    ])
    .config(['$routeProvider', '$locationProvider', '$httpProvider', function($routeProvider, $locationProvider, $httpProvider) {
        // Re-enable auth interceptor now that loading is fixed
        $httpProvider.interceptors.push('AuthInterceptor');
        $routeProvider
            .when('/', {
                template: '<home-component></home-component>'
            })
            .when('/login', {
                template: '<login-component></login-component>'
            })
            .when('/register', {
                template: '<register-component></register-component>'
            })
            .when('/dashboard', {
                template: '<dashboard-component></dashboard-component>'
            })
            .when('/interview', {
                template: '<interview-component></interview-component>'
            })
            .when('/progress', {
                template: '<progress-component></progress-component>'
            })
            .when('/profile', {
                template: '<profile-component></profile-component>'
            })
            .otherwise({
                redirectTo: '/'
            });

        // Enable HTML5 mode
        $locationProvider.html5Mode(false);
    }])
    .run(['$rootScope', '$location', 'AuthService', function($rootScope, $location, AuthService) {
        // Handle route change start
        $rootScope.$on('$routeChangeStart', function(event, next, current) {
            console.log('Route change start:', {
                from: current ? current.originalPath : 'none',
                to: next ? next.originalPath : 'none',
                authenticated: AuthService.isAuthenticated()
            });
        });
        
        // Handle route change errors (mainly authentication failures)
        $rootScope.$on('$routeChangeError', function(event, current, previous, rejection) {
            console.log('Route change error:', rejection);
            console.log('Current route:', current ? current.originalPath : 'none');
            console.log('Previous route:', previous ? previous.originalPath : 'none');
            
            if (rejection === 'Authentication required') {
                console.log('Authentication required, redirecting to login');
                $location.path('/login');
            }
        });
        
        // Handle successful route changes
        $rootScope.$on('$routeChangeSuccess', function(event, current, previous) {
            if (current && current.originalPath) {
                console.log('Route change successful:', {
                    from: previous ? previous.originalPath : 'none',
                    to: current.originalPath,
                    authenticated: AuthService.isAuthenticated()
                });
            }
        });
        
        // Add global logout function
        $rootScope.logout = function() {
            if (confirm('Are you sure you want to logout?')) {
                AuthService.logout();
            }
        };
        
        // Add debug function to check auth state
        $rootScope.debugAuth = function() {
            console.log('=== Authentication Debug Info ===');
            console.log('Current path:', $location.path());
            console.log('Is authenticated:', AuthService.isAuthenticated());
            console.log('Is protected route:', AuthService.isProtectedRoute($location.path()));
            console.log('Access token exists:', !!localStorage.getItem('access_token'));
            console.log('Refresh token exists:', !!localStorage.getItem('refresh_token'));
            console.log('User data exists:', !!localStorage.getItem('user'));
            console.log('Current user:', AuthService.getCurrentUser());
            console.log('================================');
        };
        
        // Make debug function available globally
        window.debugAuth = $rootScope.debugAuth;
    }]);
})();