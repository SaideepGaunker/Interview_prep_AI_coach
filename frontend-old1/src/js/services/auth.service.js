/**
 * Authentication Service
 */
(function() {
    'use strict';

    angular
        .module('interviewPrepApp')
        .service('AuthService', AuthService);

    AuthService.$inject = ['$q', '$location', 'ApiService'];

    function AuthService($q, $location, ApiService) {
        var service = {
            login: login,
            register: register,
            logout: logout,
            forgotPassword: forgotPassword,
            resetPassword: resetPassword,
            isAuthenticated: isAuthenticated,
            validateToken: validateToken,
            getCurrentUser: getCurrentUser,
            requireAuth: requireAuth,
            refreshToken: refreshToken
        };

        return service;

        function login(credentials) {
            return ApiService.post('/auth/login', credentials)
                .then(function(response) {
                    if (response.access_token) {
                        localStorage.setItem('access_token', response.access_token);
                        localStorage.setItem('refresh_token', response.refresh_token);
                        localStorage.setItem('user', JSON.stringify(response.user));
                        return response;
                    }
                    return $q.reject('Invalid response');
                });
        }

        function register(userData) {
            return ApiService.post('/auth/register', userData)
                .then(function(response) {
                    return response;
                });
        }

        function logout() {
            return ApiService.post('/auth/logout')
                .finally(function() {
                    localStorage.removeItem('access_token');
                    localStorage.removeItem('refresh_token');
                    localStorage.removeItem('user');
                    $location.path('/');
                });
        }

        function forgotPassword(email) {
            return ApiService.post('/auth/forgot-password', { email: email });
        }

        function resetPassword(token, newPassword) {
            return ApiService.post('/auth/reset-password', {
                token: token,
                new_password: newPassword
            });
        }

        function refreshToken() {
            var refreshToken = localStorage.getItem('refresh_token');
            if (!refreshToken) {
                return $q.reject('No refresh token available');
            }

            return ApiService.post('/auth/refresh', { refresh_token: refreshToken })
                .then(function(response) {
                    if (response.access_token) {
                        localStorage.setItem('access_token', response.access_token);
                        localStorage.setItem('refresh_token', response.refresh_token);
                        return response;
                    }
                    return $q.reject('Invalid refresh response');
                })
                .catch(function(error) {
                    // If refresh fails, clear storage without calling logout to avoid recursion
                    localStorage.removeItem('access_token');
                    localStorage.removeItem('refresh_token');
                    localStorage.removeItem('user');
                    return $q.reject(error);
                });
        }

        function isAuthenticated() {
            var token = localStorage.getItem('access_token');
            if (!token) {
                return false;
            }
            
            // Check if token is expired (basic check)
            try {
                var payload = JSON.parse(atob(token.split('.')[1]));
                var currentTime = Math.floor(Date.now() / 1000);
                if (payload.exp && payload.exp < currentTime) {
                    // Token expired, remove it without calling logout to avoid recursion
                    localStorage.removeItem('access_token');
                    localStorage.removeItem('refresh_token');
                    localStorage.removeItem('user');
                    return false;
                }
            } catch (e) {
                // Invalid token format, remove it without calling logout to avoid recursion
                localStorage.removeItem('access_token');
                localStorage.removeItem('refresh_token');
                localStorage.removeItem('user');
                return false;
            }
            
            return true;
        }

        function getCurrentUser() {
            var userStr = localStorage.getItem('user');
            return userStr ? JSON.parse(userStr) : null;
        }

        function validateToken() {
            var token = localStorage.getItem('access_token');
            if (!token) {
                return $q.reject('No token available');
            }
            
            // Validate token with backend
            return ApiService.get('/auth/validate-token')
                .then(function(response) {
                    return response;
                })
                .catch(function(error) {
                    // Token is invalid, clear storage without calling logout to avoid recursion
                    localStorage.removeItem('access_token');
                    localStorage.removeItem('refresh_token');
                    localStorage.removeItem('user');
                    return $q.reject(error);
                });
        }
        
        function requireAuth() {
            if (!isAuthenticated()) {
                $location.path('/login');
                return $q.reject('Authentication required');
            }
            
            // For now, just return success without backend validation to avoid circular issues
            // TODO: Implement proper token validation
            return $q.resolve();
            
            // Validate token with backend
            // return validateToken()
            //     .then(function() {
            //         return $q.resolve();
            //     })
            //     .catch(function(error) {
            //         $location.path('/login');
            //         return $q.reject(error);
            //     });
        }
    }
})();