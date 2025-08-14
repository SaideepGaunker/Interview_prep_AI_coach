/**
 * Dashboard Controller for main user dashboard
 */
(function() {
    'use strict';

    angular
        .module('interviewPrepApp')
        .controller('DashboardController', DashboardController);

    DashboardController.$inject = ['$location', 'AuthService', 'ApiService'];

    function DashboardController($location, AuthService, ApiService) {
        var vm = this;
        
        // Properties
        vm.user = AuthService.getCurrentUser();
        vm.loading = true;
        vm.error = '';
        vm.stats = {};
        vm.recentSessions = [];
        vm.progressData = {};
        
        // Methods
        vm.startInterview = startInterview;
        vm.viewProgress = viewProgress;
        vm.goToProfile = goToProfile;
        vm.refreshData = refreshData;
        
        // Initialize
        activate();
        
        function activate() {
            loadDashboardData();
        }
        
        function loadDashboardData() {
            vm.loading = true;
            vm.error = '';
            
            // Load user statistics
            ApiService.get('/analytics/progress')
                .then(function(response) {
                    vm.stats = response.stats || {
                        totalSessions: 0,
                        completedSessions: 0,
                        averageScore: 0,
                        improvementTrend: 0
                    };
                })
                .catch(function(error) {
                    console.error('Failed to load stats:', error);
                    // Set default stats
                    vm.stats = {
                        totalSessions: 0,
                        completedSessions: 0,
                        averageScore: 0,
                        improvementTrend: 0
                    };
                });
            
            // Load recent sessions
            ApiService.get('/analytics/sessions', { limit: 5 })
                .then(function(response) {
                    vm.recentSessions = response.sessions || [];
                })
                .catch(function(error) {
                    console.error('Failed to load recent sessions:', error);
                    vm.recentSessions = [];
                });
            
            // Load progress trends
            ApiService.get('/analytics/trends', { days: 30 })
                .then(function(response) {
                    vm.progressData = response.trends || {};
                })
                .catch(function(error) {
                    console.error('Failed to load progress data:', error);
                    vm.progressData = {};
                })
                .finally(function() {
                    vm.loading = false;
                });
        }
        
        function startInterview() {
            $location.path('/interview');
        }
        
        function viewProgress() {
            $location.path('/progress');
        }
        
        function goToProfile() {
            $location.path('/profile');
        }
        
        function refreshData() {
            loadDashboardData();
        }
        
        // Helper methods
        vm.getScoreColor = function(score) {
            if (score >= 80) return 'success';
            if (score >= 60) return 'warning';
            return 'danger';
        };
        
        vm.getTrendIcon = function(trend) {
            if (trend > 0) return 'fas fa-arrow-up text-success';
            if (trend < 0) return 'fas fa-arrow-down text-danger';
            return 'fas fa-minus text-muted';
        };
        
        vm.formatDate = function(dateString) {
            if (!dateString) return 'N/A';
            var date = new Date(dateString);
            return date.toLocaleDateString();
        };
        
        vm.getSessionTypeIcon = function(type) {
            switch (type) {
                case 'hr': return 'fas fa-users';
                case 'technical': return 'fas fa-code';
                case 'mixed': return 'fas fa-layer-group';
                default: return 'fas fa-question-circle';
            }
        };
        
        vm.getSessionStatusBadge = function(status) {
            switch (status) {
                case 'completed': return 'badge bg-success';
                case 'active': return 'badge bg-primary';
                case 'paused': return 'badge bg-warning';
                default: return 'badge bg-secondary';
            }
        };
    }
})();