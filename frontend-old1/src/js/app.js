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
    .config(['$routeProvider', '$locationProvider', function($routeProvider, $locationProvider) {
        $routeProvider
            .when('/', {
                templateUrl: 'views/home.html',
                controller: 'MainController',
                controllerAs: 'vm'
            })
            .when('/login', {
                templateUrl: 'views/auth/login.html',
                controller: 'AuthController',
                controllerAs: 'vm'
            })
            .when('/register', {
                templateUrl: 'views/auth/register.html',
                controller: 'AuthController',
                controllerAs: 'vm'
            })
            .when('/dashboard', {
                templateUrl: 'views/dashboard.html',
                controller: 'DashboardController',
                controllerAs: 'vm',
                resolve: {
                    auth: ['AuthService', function(AuthService) {
                        return AuthService.requireAuth();
                    }]
                }
            })
            .when('/interview', {
                templateUrl: 'views/interview/session.html',
                controller: 'InterviewController',
                controllerAs: 'vm',
                resolve: {
                    auth: ['AuthService', function(AuthService) {
                        return AuthService.requireAuth();
                    }]
                }
            })
            .when('/progress', {
                templateUrl: 'views/progress.html',
                controller: 'ProgressController',
                controllerAs: 'vm',
                resolve: {
                    auth: ['AuthService', function(AuthService) {
                        return AuthService.requireAuth();
                    }]
                }
            })
            .when('/profile', {
                templateUrl: 'views/profile.html',
                controller: 'ProfileController',
                controllerAs: 'vm',
                resolve: {
                    auth: ['AuthService', function(AuthService) {
                        return AuthService.requireAuth();
                    }]
                }
            })
            .otherwise({
                redirectTo: '/'
            });

        // Enable HTML5 mode
        $locationProvider.html5Mode(false);
    }])
    .run(['$rootScope', '$location', 'AuthService', function($rootScope, $location, AuthService) {
        // Check authentication on route changes
        $rootScope.$on('$routeChangeStart', function(event, next, current) {
            if (next.resolve && next.resolve.auth) {
                if (!AuthService.isAuthenticated()) {
                    $location.path('/login');
                }
            }
        });
        
        // Add global logout function
        $rootScope.logout = function() {
            if (confirm('Are you sure you want to logout?')) {
                AuthService.logout();
            }
        };
        
        // Check authentication status periodically (every 5 minutes)
        setInterval(function() {
            if (AuthService.isAuthenticated()) {
                // Validate token with backend
                AuthService.validateToken().catch(function(error) {
                    console.log('Token validation failed, redirecting to login');
                    $location.path('/login');
                });
            }
        }, 5 * 60 * 1000); // 5 minutes
    }]);
})();